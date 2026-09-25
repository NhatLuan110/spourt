import { Injectable } from '@nestjs/common';
import type { Exercise, Skill, StudySession } from '@prisma/client';
import {
  gradeDictation,
  gradeReorder,
  gradeShortAnswer,
  gradeTrueFalse,
} from '@sprout/scoring';
import type { GradeOutcome } from '@sprout/scoring';
import type {
  ActivityResult,
  DiffToken,
  ExerciseFeedback,
  ExerciseSubmitInput,
  LessonExerciseMode,
  XpSource,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

interface StoredAnswer {
  optionId?: unknown;
  accept?: unknown;
  value?: unknown;
  order?: unknown;
  sentence?: unknown;
  text?: unknown;
  display?: unknown;
}

interface Graded extends GradeOutcome {
  /** What the review screen shows as the right answer. */
  correctAnswer: string;
  diff?: DiffToken[];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Reorder answers travel as a JSON array of chunk ids. */
function parseOrder(given: string): string[] {
  try {
    const parsed: unknown = JSON.parse(given);
    return asStrings(parsed);
  } catch {
    // A learner who never touched the widget sends the raw string; treat it as
    // a single chunk rather than failing the whole submission.
    return given.length > 0 ? [given] : [];
  }
}

/**
 * Grades one exercise from its stored answer. Every format is here rather than
 * in each feature, so grammar, reading and listening cannot drift apart.
 */
export function gradeExercise(row: Exercise, given: string): Graded {
  const stored = (row.answer ?? {}) as StoredAnswer;
  const body = (row.body ?? {}) as Record<string, unknown>;
  const mode = body['mode'] as LessonExerciseMode | undefined;

  switch (mode) {
    case 'mcq': {
      const expected = typeof stored.optionId === 'string' ? stored.optionId : '';
      const options = Array.isArray(body['options']) ? body['options'] : [];
      const correct = options.find(
        (option): option is { id: string; text: string } =>
          typeof option === 'object' &&
          option !== null &&
          (option as { id?: unknown }).id === expected,
      );
      return {
        isCorrect: given === expected,
        score: given === expected ? 1 : 0,
        correctAnswer: correct?.text ?? '',
      };
    }
    case 'gap-fill':
    case 'short-answer': {
      const accept = asStrings(stored.accept);
      const outcome = gradeShortAnswer(accept, given);
      return {
        ...outcome,
        correctAnswer: typeof stored.display === 'string' ? stored.display : (accept[0] ?? ''),
      };
    }
    case 'true-false': {
      const expected = stored.value === true;
      const normalised = given.trim().toLowerCase();
      // Anything that is not one of the two words is not an answer. Treating
      // unparseable input as "false" would score a garbage submission correct
      // half the time.
      if (normalised !== 'true' && normalised !== 'false') {
        return { isCorrect: false, score: 0, correctAnswer: expected ? 'true' : 'false' };
      }
      const outcome = gradeTrueFalse(expected, normalised === 'true');
      return { ...outcome, correctAnswer: expected ? 'true' : 'false' };
    }
    case 'reorder': {
      const expected = asStrings(stored.order);
      const outcome = gradeReorder(expected, parseOrder(given));
      return {
        ...outcome,
        correctAnswer: typeof stored.sentence === 'string' ? stored.sentence : '',
      };
    }
    case 'dictation': {
      const reference = typeof stored.text === 'string' ? stored.text : '';
      const result = gradeDictation(reference, given);
      return {
        // §9.5 — a dictation line counts as correct at 90 percent or better,
        // because one missing article should not read as a failure.
        isCorrect: result.score >= 0.9,
        score: result.score,
        correctAnswer: reference,
        diff: result.tokens,
      };
    }
    default:
      return { isCorrect: false, score: 0, correctAnswer: '' };
  }
}

export interface SubmitParams {
  userId: string;
  input: ExerciseSubmitInput;
  skill: Skill;
  xpSource: XpSource;
  /** "grammar-lesson" | "reading-passage" | "listening-track" — for MistakeLog. */
  sourceType: string;
  sourceId: string;
  /** Only these exercises may be graded, so a learner cannot submit answers
   *  to a different activity's questions and collect the XP twice. */
  allowedExerciseIds: string[];
  now?: Date;
}

@Injectable()
export class LearningEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  /** Opens a session so the server, not the client, owns the elapsed time. */
  async startSession(userId: string, skill: Skill, now = new Date()): Promise<StudySession> {
    return this.prisma.studySession.create({ data: { userId, skill, startedAt: now } });
  }

  /**
   * Grades a whole set, records every attempt, logs the mistakes and pays out
   * once. Used by grammar, reading and listening alike.
   */
  async submit(params: SubmitParams): Promise<ActivityResult> {
    const now = params.now ?? new Date();
    const allowed = new Set(params.allowedExerciseIds);
    const requested = params.input.answers.filter((answer) => allowed.has(answer.exerciseId));
    if (requested.length === 0) {
      throw AppException.notFound('Bài tập trong hoạt động này');
    }

    const session = await this.loadSession(params.userId, params.input.sessionId);

    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: requested.map((answer) => answer.exerciseId) } },
    });
    const byId = new Map(rows.map((row): [string, Exercise] => [row.id, row]));

    const feedback: ExerciseFeedback[] = [];
    let correctCount = 0;
    let scoreSum = 0;

    for (const answer of requested) {
      const row = byId.get(answer.exerciseId);
      if (!row) continue;

      const graded = gradeExercise(row, answer.answer);
      if (graded.isCorrect) correctCount += 1;
      scoreSum += graded.score;

      await this.prisma.exerciseAttempt.create({
        data: {
          userId: params.userId,
          exerciseId: row.id,
          userAnswer: { value: answer.answer },
          isCorrect: graded.isCorrect,
          score: graded.score,
          timeSpentMs: answer.timeSpentMs,
          hintsUsed: answer.hintsUsed,
          attemptedAt: now,
        },
      });

      if (!graded.isCorrect) {
        await this.prisma.mistakeLog.create({
          data: {
            userId: params.userId,
            skill: params.skill,
            category: `${params.sourceType}-${row.type.toLowerCase()}`,
            detail: row.prompt,
            sourceType: params.sourceType,
            sourceId: row.id,
            occurredAt: now,
          },
        });
      }

      const body = (row.body ?? {}) as Record<string, unknown>;
      feedback.push({
        exerciseId: row.id,
        mode: (body['mode'] as ExerciseFeedback['mode']) ?? 'short-answer',
        isCorrect: graded.isCorrect,
        score: graded.score,
        yourAnswer: answer.answer,
        correctAnswer: graded.correctAnswer,
        explanationVi: row.explanationVi,
        ...(graded.typo === true ? { typo: true } : {}),
        ...(graded.diff ? { diff: graded.diff } : {}),
      });
    }

    const accuracy = scoreSum / feedback.length;
    const durationSec = this.durationOf(session, params.input.elapsedMs, now);

    const reward = await this.gamification.award({
      userId: params.userId,
      source: params.xpSource,
      skill: params.skill,
      refType: params.sourceType,
      refId: params.sourceId,
      accuracy,
      studySeconds: durationSec,
      // One observation per activity, not per question (§9.7).
      observationScore: Math.round(accuracy * 100),
      now,
    });

    if (session) {
      await this.prisma.studySession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          durationSec,
          itemsCompleted: feedback.length,
          xpEarned: reward.xpEarned,
        },
      });
    }

    return {
      sessionId: session?.id ?? null,
      correctCount,
      total: feedback.length,
      accuracy: Math.round(accuracy * 1000) / 1000,
      durationSec,
      feedback,
      reward,
    };
  }

  private async loadSession(
    userId: string,
    sessionId: string | undefined,
  ): Promise<StudySession | null> {
    if (!sessionId) return null;
    const session = await this.prisma.studySession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw AppException.notFound('Phiên học');
    if (session.endedAt) {
      throw AppException.conflict('ATTEMPT_ALREADY_SUBMITTED', 'Phiên này đã được chấm rồi.');
    }
    return session;
  }

  /**
   * The session start is authoritative when there is one; without a session the
   * client's own stopwatch is used, clamped to two hours so a tab left open
   * overnight cannot report a nine-hour study session.
   */
  private durationOf(session: StudySession | null, elapsedMs: number | undefined, now: Date): number {
    const fromSession = session
      ? Math.round((now.getTime() - session.startedAt.getTime()) / 1000)
      : Math.round((elapsedMs ?? 0) / 1000);
    return Math.max(1, Math.min(7200, fromSession));
  }
}
