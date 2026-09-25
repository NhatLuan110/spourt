import { Injectable } from '@nestjs/common';
import type { Prisma, SpeakingAttempt, SpeakingDrill } from '@prisma/client';
import {
  SCORE_BAND_LABEL_VI,
  detectIssues,
  patternForPhoneme,
  scoreBand,
  scoreSpeech,
  targetWpmRange,
  wordColor,
  VIETNAMESE_ERROR_PATTERNS,
  type WordScore,
} from '@sprout/scoring';
import type {
  CefrLevel,
  PronunciationIssueView,
  SpeakingAttemptInput,
  SpeakingAttemptView,
  SpeakingDrillCard,
  SpeakingKind,
  SpeakingListQuery,
  SpeakingWordScore,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { GamificationService } from '../gamification/gamification.service';

/** Attempts below this are worth a nudge rather than praise. */
const PASS_SCORE = 60;

@Injectable()
export class SpeakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly gamification: GamificationService,
  ) {}

  /** Whether recording is usable at all, so the UI can say so up front. */
  capabilities(): { canTranscribe: boolean; canSpeak: boolean; provider: string } {
    return {
      canTranscribe: this.ai.canTranscribe(),
      canSpeak: this.ai.canSpeak(),
      provider: this.ai.speechProviderName,
    };
  }

  async drills(userId: string, query: SpeakingListQuery): Promise<SpeakingDrillCard[]> {
    const where: Prisma.SpeakingDrillWhereInput = {};
    if (query.cefr) where.cefr = query.cefr;
    if (query.focus) where.focus = query.focus;

    if (query.weakOnly) {
      const weak = await this.weakFocuses(userId);
      // No recorded weakness yet means every drill is equally relevant, so the
      // filter is dropped rather than returning an empty list.
      if (weak.length > 0) where.focus = { in: weak };
    }

    const drills = await this.prisma.speakingDrill.findMany({
      where,
      orderBy: [{ cefr: 'asc' }, { focus: 'asc' }],
    });

    const attempts = await this.prisma.speakingAttempt.findMany({
      where: { userId, kind: 'drill' },
      select: { targetText: true, overallScore: true },
    });

    const stats = new Map<string, { attempts: number; best: number | null }>();
    for (const attempt of attempts) {
      if (!attempt.targetText) continue;
      const entry = stats.get(attempt.targetText) ?? { attempts: 0, best: null };
      entry.attempts += 1;
      if (attempt.overallScore !== null) {
        entry.best = Math.max(entry.best ?? 0, attempt.overallScore);
      }
      stats.set(attempt.targetText, entry);
    }

    return drills.map((drill) => this.toDrillCard(drill, stats.get(drill.text)));
  }

  async drill(userId: string, slug: string): Promise<SpeakingDrillCard> {
    const drill = await this.prisma.speakingDrill.findUnique({ where: { slug } });
    if (!drill) throw AppException.notFound('Bài luyện phát âm');

    const attempts = await this.prisma.speakingAttempt.findMany({
      where: { userId, kind: 'drill', targetText: drill.text },
      select: { overallScore: true },
    });

    return this.toDrillCard(drill, {
      attempts: attempts.length,
      best: attempts.reduce<number | null>(
        (best, row) => (row.overallScore === null ? best : Math.max(best ?? 0, row.overallScore)),
        null,
      ),
    });
  }

  /**
   * Transcribes a recording, scores it, and records which sounds went wrong.
   *
   * The attempt row is written before transcription so a failed call leaves a
   * visible failure rather than nothing, the same rule writing follows.
   */
  async assess(
    userId: string,
    input: SpeakingAttemptInput,
    now = new Date(),
  ): Promise<SpeakingAttemptView> {
    if (!this.ai.canTranscribe()) {
      throw AppException.conflict(
        'AI_PROVIDER_ERROR',
        'Chấm phát âm chưa được cấu hình. Thêm AI_API_KEY vào .env để bật.',
      );
    }

    const drill = input.drillSlug
      ? await this.prisma.speakingDrill.findUnique({ where: { slug: input.drillSlug } })
      : null;
    if (input.drillSlug && !drill) throw AppException.notFound('Bài luyện phát âm');

    const target = drill?.text ?? input.targetText;
    if (!target) {
      throw AppException.validation(
        { targetText: 'required' },
        'Cần chọn một bài luyện, hoặc tự nhập câu muốn đọc.',
      );
    }

    const audio = Buffer.from(input.audioBase64, 'base64');
    const attempt = await this.prisma.speakingAttempt.create({
      data: {
        userId,
        kind: 'drill',
        targetText: target,
        // No object store is configured, so the recording is scored and
        // discarded rather than kept somewhere it would never be cleaned up.
        audioUrl: '',
        transcript: '',
        durationMs: input.durationMs,
        status: 'pending',
        createdAt: now,
      },
    });

    let transcript: string;
    try {
      const heard = await this.ai.transcribe(
        { userId, feature: 'speaking' },
        { audio, mimeType: input.mimeType, expected: target },
      );
      transcript = heard.text;
    } catch (error) {
      await this.prisma.speakingAttempt.update({
        where: { id: attempt.id },
        data: { status: 'failed' },
      });
      throw error;
    }

    const cefr = drill?.cefr ?? (await this.levelOf(userId));
    const scored = scoreSpeech({
      reference: target,
      transcript,
      durationMs: input.durationMs,
      cefr,
    });

    const issues = detectIssues(scored.words);
    await this.recordIssues(userId, scored.words, drill?.focus, now);

    const feedbackVi = buildFeedback(scored.overall, scored.words, drill?.tipVi ?? null);

    const saved = await this.prisma.speakingAttempt.update({
      where: { id: attempt.id },
      data: {
        transcript,
        accuracyScore: scored.scores.accuracy,
        fluencyScore: scored.scores.fluency,
        completenessScore: scored.scores.completeness,
        // Left null rather than zero: nothing measured it (D-051).
        prosodyScore: null,
        overallScore: scored.overall,
        wordScores: scored.words as unknown as Prisma.InputJsonValue,
        aiFeedbackVi: feedbackVi,
        status: 'scored',
      },
    });

    await this.gamification.award({
      userId,
      source: 'SPEAKING',
      skill: 'SPEAKING',
      refType: 'speaking-attempt',
      refId: attempt.id,
      score: scored.overall,
      observationScore: Math.round(scored.overall),
      studySeconds: Math.max(15, Math.round(input.durationMs / 1000)),
      now,
    });

    if (scored.overall < PASS_SCORE) {
      await this.prisma.mistakeLog.create({
        data: {
          userId,
          skill: 'SPEAKING',
          category: `speaking-${drill?.focus ?? 'general'}`,
          detail: target,
          sourceType: 'speaking-drill',
          sourceId: attempt.id,
          occurredAt: now,
        },
      });
    }

    return this.toAttemptView(saved, scored.words, scored.extraWords, scored.wpm, cefr, issues);
  }

  async history(userId: string, limit = 20): Promise<SpeakingAttemptView[]> {
    const rows = await this.prisma.speakingAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const level = await this.levelOf(userId);
    return rows.map((row) => {
      const words = readWordScores(row.wordScores);
      return this.toAttemptView(row, words, [], 0, level, detectIssues(words));
    });
  }

  /** The sounds this learner keeps getting wrong, worst first. */
  async issues(userId: string): Promise<PronunciationIssueView[]> {
    const rows = await this.prisma.pronunciationIssue.findMany({
      where: { userId },
      orderBy: { errorCount: 'desc' },
    });
    return rows.flatMap((row) => toIssueView(row.phoneme, row.errorCount, row.totalCount));
  }

  /** Which drill focuses this learner would benefit from most. */
  private async weakFocuses(userId: string): Promise<string[]> {
    const rows = await this.prisma.pronunciationIssue.findMany({
      where: { userId, errorCount: { gt: 0 } },
      orderBy: { errorCount: 'desc' },
      take: 20,
    });

    const focuses = new Set<string>();
    for (const row of rows) {
      const pattern = patternForPhoneme(row.phoneme);
      if (pattern) focuses.add(pattern.drillFocus);
    }
    return [...focuses];
  }

  /**
   * Updates the running per-phoneme tally.
   *
   * Without Azure there are no phoneme scores, so what is recorded is what the
   * drill was targeting: a failed "th" drill counts against the th sounds. That
   * is coarser than phoneme-level truth but it is not a guess — the drill was
   * written to isolate exactly that sound (D-051).
   */
  private async recordIssues(
    userId: string,
    words: WordScore[],
    focus: string | undefined,
    now: Date,
  ): Promise<void> {
    const tallies = new Map<string, { errors: number; total: number }>();

    for (const issue of detectIssues(words)) {
      tallies.set(issue.phoneme, { errors: issue.errorCount, total: issue.totalCount });
    }

    if (focus) {
      const pattern = VIETNAMESE_ERROR_PATTERNS.find((entry) => entry.drillFocus === focus);
      const failed = words.filter((word) => word.score < PASS_SCORE).length;
      for (const phoneme of pattern?.phonemes ?? []) {
        const entry = tallies.get(phoneme) ?? { errors: 0, total: 0 };
        entry.total += 1;
        if (failed > 0) entry.errors += 1;
        tallies.set(phoneme, entry);
      }
    }

    for (const [phoneme, tally] of tallies) {
      await this.prisma.pronunciationIssue.upsert({
        where: { userId_phoneme: { userId, phoneme } },
        update: {
          errorCount: { increment: tally.errors },
          totalCount: { increment: tally.total },
          lastSeenAt: now,
        },
        create: {
          userId,
          phoneme,
          errorCount: tally.errors,
          totalCount: tally.total,
          lastSeenAt: now,
        },
      });
    }
  }

  private async levelOf(userId: string): Promise<CefrLevel> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { currentLevel: true },
    });
    return profile?.currentLevel ?? 'A2';
  }

  private toDrillCard(
    drill: SpeakingDrill,
    stats: { attempts: number; best: number | null } | undefined,
  ): SpeakingDrillCard {
    const pattern = VIETNAMESE_ERROR_PATTERNS.find((entry) => entry.drillFocus === drill.focus);
    return {
      slug: drill.slug,
      text: drill.text,
      cefr: drill.cefr,
      focus: drill.focus,
      focusLabelVi: pattern?.labelVi ?? drill.focus,
      ipa: drill.ipa,
      translationVi: drill.translationVi,
      audioUrl: drill.audioUrl,
      minimalPair: drill.minimalPair,
      tipVi: drill.tipVi,
      bestScore: stats?.best ?? null,
      attempts: stats?.attempts ?? 0,
    };
  }

  private toAttemptView(
    row: SpeakingAttempt,
    words: WordScore[],
    extraWords: string[],
    wpm: number,
    cefr: CefrLevel,
    issues: ReturnType<typeof detectIssues>,
  ): SpeakingAttemptView {
    const overall = row.overallScore ?? 0;
    const band = scoreBand(overall);

    return {
      id: row.id,
      kind: row.kind as SpeakingKind,
      targetText: row.targetText,
      transcript: row.transcript,
      durationMs: row.durationMs,
      scores: {
        accuracy: row.accuracyScore ?? 0,
        fluency: row.fluencyScore ?? 0,
        completeness: row.completenessScore ?? 0,
        prosody: row.prosodyScore,
        overall,
      },
      band,
      bandLabelVi: SCORE_BAND_LABEL_VI[band],
      words: words.map(
        (word): SpeakingWordScore => ({
          word: word.word,
          score: word.score,
          errorType: word.errorType ?? 'None',
          color: wordColor(word.score),
        }),
      ),
      extraWords,
      wpm,
      targetWpm: targetWpmRange(cefr),
      feedbackVi: row.aiFeedbackVi ?? '',
      issues: issues.flatMap((issue) =>
        toIssueView(issue.phoneme, issue.errorCount, issue.totalCount),
      ),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/**
 * Feedback assembled from the numbers rather than asked of a model.
 *
 * A second AI call per attempt would double the cost and the latency to say
 * something the scores already determine, and it could contradict them.
 */
export function buildFeedback(
  overall: number,
  words: WordScore[],
  tipVi: string | null,
): string {
  const weak = words.filter((word) => word.score < PASS_SCORE);
  const omitted = words.filter((word) => word.errorType === 'Omission');
  const lines: string[] = [];

  if (overall >= 85) {
    lines.push('Rất tốt. Câu này gần như không còn gì phải sửa.');
  } else if (overall >= PASS_SCORE) {
    lines.push('Nghe hiểu được. Còn vài chỗ đáng chỉnh.');
  } else {
    lines.push('Người nghe sẽ khó hiểu ở vài chỗ. Đọc chậm lại và thử lại nhé.');
  }

  if (omitted.length > 0) {
    lines.push(
      `Bị nuốt mất: ${omitted.map((word) => word.word).join(', ')}. Đọc rõ từng từ, đừng lướt.`,
    );
  }

  const mispronounced = weak.filter((word) => word.errorType !== 'Omission');
  if (mispronounced.length > 0) {
    lines.push(`Chưa rõ: ${mispronounced.map((word) => word.word).join(', ')}.`);
  }

  if (tipVi && overall < 85) lines.push(tipVi);

  return lines.join(' ');
}

function toIssueView(
  phoneme: string,
  errorCount: number,
  totalCount: number,
): PronunciationIssueView[] {
  const pattern = patternForPhoneme(phoneme);
  if (!pattern) return [];
  return [
    {
      phoneme,
      errorCount,
      totalCount,
      labelVi: pattern.labelVi,
      tipVi: pattern.tipVi,
      exampleWords: pattern.minimalPairs.flat().slice(0, 4),
    },
  ];
}

function readWordScores(value: unknown): WordScore[] {
  return Array.isArray(value) ? (value as unknown as WordScore[]) : [];
}
