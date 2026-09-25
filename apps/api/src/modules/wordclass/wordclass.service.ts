import { Injectable } from '@nestjs/common';
import { POS_LABEL_VI, seededShuffle } from '@sprout/shared';
import type {
  SuffixRuleView,
  WordClassPracticeRequest,
  WordClassSubmitInput,
  WordFamilyView,
  WordFormItem,
  WordFormSet,
} from '@sprout/shared';
import { blankOut, gapHint, gradeGapFill } from '@sprout/scoring';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import { GamificationService } from '../gamification/gamification.service';

const FAMILY_INCLUDE = {
  members: {
    include: {
      word: {
        include: {
          senses: { orderBy: { order: 'asc' }, take: 1, select: { definitionVi: true } },
        },
      },
    },
  },
} satisfies Prisma.WordFamilyInclude;

/** §7.4 — word class, suffixes and word families. */
@Injectable()
export class WordClassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  /** §7.4.2 — the suffix table, most reliable signals first. */
  async suffixRules(): Promise<SuffixRuleView[]> {
    const rules = await this.prisma.suffixRule.findMany({
      orderBy: [{ order: 'asc' }, { suffix: 'asc' }],
    });

    return rules.map((rule) => ({
      suffix: rule.suffix,
      pos: rule.pos,
      posLabelVi: POS_LABEL_VI[rule.pos],
      reliability: rule.reliability,
      explanationVi: rule.explanationVi,
      examples: rule.examples,
      exceptions: rule.exceptions,
    }));
  }

  /** Every family, with how much of each the learner already knows. */
  async families(userId: string) {
    const families = await this.prisma.wordFamily.findMany({
      orderBy: { rootSlug: 'asc' },
      include: FAMILY_INCLUDE,
    });

    const wordIds = families.flatMap((family) => family.members.map((member) => member.wordId));
    const known = await this.prisma.userWord.findMany({
      where: { userId, wordId: { in: wordIds } },
      select: { wordId: true, state: true },
    });
    const byWord = new Map(known.map((row) => [row.wordId, row.state]));

    return families.map((family) => ({
      rootSlug: family.rootSlug,
      glossVi: family.glossVi,
      memberCount: family.members.length,
      knownCount: family.members.filter((member) => byWord.has(member.wordId)).length,
      posList: [...new Set(family.members.map((member) => member.pos))],
    }));
  }

  async family(userId: string, rootSlug: string): Promise<WordFamilyView> {
    const family = await this.prisma.wordFamily.findUnique({
      where: { rootSlug },
      include: FAMILY_INCLUDE,
    });
    if (!family) throw AppException.notFound('Họ từ');

    const known = await this.prisma.userWord.findMany({
      where: { userId, wordId: { in: family.members.map((member) => member.wordId) } },
      select: { wordId: true, state: true },
    });
    const byWord = new Map(known.map((row) => [row.wordId, row.state]));

    return {
      rootSlug: family.rootSlug,
      glossVi: family.glossVi,
      members: family.members.map((member) => ({
        wordId: member.wordId,
        lemma: member.word.lemma,
        slug: member.word.slug,
        pos: member.pos,
        posLabelVi: POS_LABEL_VI[member.pos],
        suffix: member.suffix,
        note: member.note,
        ipaUs: member.word.ipaUs,
        definitionVi: member.word.senses[0]?.definitionVi ?? null,
        learnState: byWord.get(member.wordId) ?? null,
      })),
    };
  }

  /**
   * §7.4.3 — "The company decided to ____ (expand)." The gap is a real sentence
   * from the derived word's own examples, and the bracket shows the family root,
   * so the learner has to produce the right class, not recall a memorised line.
   */
  async practice(
    userId: string,
    request: WordClassPracticeRequest,
  ): Promise<WordFormSet> {
    const where: Prisma.WordFormWhereInput = {};
    if (request.rootSlug) where.family = { rootSlug: request.rootSlug };
    if (request.pos) where.pos = request.pos;

    const forms = await this.prisma.wordForm.findMany({
      where,
      include: {
        family: { include: { members: { include: { word: true } } } },
        word: {
          include: {
            senses: {
              orderBy: { order: 'asc' },
              take: 1,
              include: { examples: { orderBy: { id: 'asc' } } },
            },
          },
        },
      },
      take: 200,
    });

    const session = await this.prisma.studySession.create({
      data: { userId, skill: 'GRAMMAR' },
    });
    const seed = Number.parseInt(session.id.slice(-8), 36) || 1;

    const items: WordFormItem[] = [];
    for (const form of seededShuffle(forms, seed)) {
      if (items.length >= request.count) break;

      const example = form.word.senses[0]?.examples.find(
        (item) => item.highlightEnd > item.highlightStart,
      );
      if (!example) continue;

      const blanked = blankOut(example.textEn, example.highlightStart, example.highlightEnd);
      if (!blanked) continue;

      const root = form.family.members.find(
        (member) => member.word.slug === form.family.rootSlug,
      );
      const baseLemma = root?.word.lemma ?? form.family.rootSlug;
      // A gap whose bracket already shows the answer teaches nothing.
      if (baseLemma.toLowerCase() === blanked.answer.toLowerCase()) continue;

      const id = `wf_${form.wordId}`;
      await this.prisma.exercise.upsert({
        where: { id },
        create: {
          id,
          type: 'WORD_FORM',
          cefr: form.word.cefr,
          skill: 'GRAMMAR',
          prompt: blanked.prompt,
          promptVi: example.textVi,
          body: {
            prompt: blanked.prompt,
            translation: example.textVi,
            baseLemma,
            targetPos: form.pos,
            hint: gapHint(blanked.answer),
          },
          answer: { value: blanked.answer },
          explanationVi: this.explainForm(
            baseLemma,
            blanked.answer,
            form.pos,
            form.suffix,
            form.note,
          ),
          tags: ['word-class', form.family.rootSlug],
        },
        update: {},
      });

      items.push({
        id,
        wordId: form.wordId,
        prompt: blanked.prompt,
        translation: example.textVi,
        baseLemma,
        targetPos: form.pos,
        targetPosLabelVi: POS_LABEL_VI[form.pos],
        rootSlug: form.family.rootSlug,
      });
    }

    if (items.length === 0) {
      await this.prisma.studySession.delete({ where: { id: session.id } });
      throw AppException.notFound('Bài tập word form', 'Chưa có họ từ nào đủ ví dụ để luyện.');
    }

    return { sessionId: session.id, items, total: items.length };
  }

  private explainForm(
    baseLemma: string,
    answer: string,
    pos: string,
    suffix: string | null,
    note: string | null,
  ): string {
    const posLabel = POS_LABEL_VI[pos as keyof typeof POS_LABEL_VI] ?? pos;
    const suffixPart = suffix
      ? ` Hậu tố "${suffix}" biến ${baseLemma} thành ${posLabel}.`
      : ` Dạng này của ${baseLemma} là ${posLabel}.`;
    return `${baseLemma} → ${answer}.${suffixPart}${note ? ` ${note}` : ''}`;
  }

  async submit(userId: string, input: WordClassSubmitInput, now = new Date()) {
    const session = await this.prisma.studySession.findUnique({ where: { id: input.sessionId } });
    if (!session || session.userId !== userId) throw AppException.notFound('Phiên luyện tập');
    if (session.endedAt) {
      throw AppException.conflict('ATTEMPT_ALREADY_SUBMITTED', 'Phiên này đã được chấm rồi.');
    }

    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: input.answers.map((answer) => answer.itemId) } },
    });
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

    const results = [];
    let scoreSum = 0;
    let correct = 0;

    for (const answer of input.answers) {
      const exercise = byId.get(answer.itemId);
      if (!exercise) continue;

      const expected = String((exercise.answer as { value?: string }).value ?? '');
      const graded = gradeGapFill(expected, answer.answer);
      scoreSum += graded.score;
      if (graded.isCorrect) correct += 1;

      await this.prisma.exerciseAttempt.create({
        data: {
          userId,
          exerciseId: exercise.id,
          userAnswer: { value: answer.answer },
          isCorrect: graded.isCorrect,
          score: graded.score,
          timeSpentMs: answer.timeSpentMs,
          attemptedAt: now,
        },
      });

      if (!graded.isCorrect) {
        await this.prisma.mistakeLog.create({
          data: {
            userId,
            skill: 'GRAMMAR',
            category: 'word-form',
            detail: `${expected} ← ${answer.answer || '(bỏ trống)'}`,
            sourceType: 'word-class',
            sourceId: exercise.id,
            occurredAt: now,
          },
        });
      }

      results.push({
        itemId: exercise.id,
        isCorrect: graded.isCorrect,
        isNear: graded.isNear,
        score: graded.score,
        correctAnswer: expected,
        explanationVi: exercise.explanationVi,
      });
    }

    if (results.length === 0) throw AppException.notFound('Bài tập trong phiên');

    const accuracy = scoreSum / results.length;
    const durationSec = Math.max(
      1,
      Math.round((now.getTime() - session.startedAt.getTime()) / 1000),
    );

    const reward = await this.gamification.award({
      userId,
      source: 'QUIZ',
      skill: 'GRAMMAR',
      refType: 'study_session',
      refId: session.id,
      accuracy,
      studySeconds: durationSec,
      observationScore: Math.round(accuracy * 100),
      now,
    });

    await this.prisma.studySession.update({
      where: { id: session.id },
      data: {
        endedAt: now,
        durationSec,
        itemsCompleted: results.length,
        xpEarned: reward.xpEarned,
      },
    });

    return {
      sessionId: session.id,
      results,
      correct,
      total: results.length,
      accuracy: Math.round(accuracy * 1000) / 1000,
      xpEarned: reward.xpEarned,
      coinsEarned: reward.coinsEarned,
      durationSec,
    };
  }
}
