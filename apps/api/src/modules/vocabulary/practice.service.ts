import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { POS_LABEL_VI, seededShuffle } from '@sprout/shared';
import type {
  PracticeItem,
  PracticeOption,
  PracticeResult,
  PracticeSet,
  PracticeSubmitInput,
  VocabExerciseMode,
  VocabPracticeRequest,
} from '@sprout/shared';
import { blankOut, gapHint, gradeGapFill, pickDistractors } from '@sprout/scoring';
import type { DistractorCandidate } from '@sprout/scoring';
import type { ExerciseType, Prisma } from '@prisma/client';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import { GamificationService } from '../gamification/gamification.service';

/** How many wrong options a multiple-choice item carries. */
const DISTRACTOR_COUNT = 3;
/** How many pairs one matching item holds. */
const MATCHING_SIZE = 5;

const MODE_TYPE: Record<VocabExerciseMode, ExerciseType> = {
  'mcq-meaning': 'MCQ',
  'mcq-reverse': 'MCQ',
  'gap-fill': 'GAP_FILL',
  'listen-type': 'DICTATION',
  matching: 'MATCHING',
};

const MODE_INSTRUCTION: Record<VocabExerciseMode, string> = {
  'mcq-meaning': 'practice.instruction.mcqMeaning',
  'mcq-reverse': 'practice.instruction.mcqReverse',
  'gap-fill': 'practice.instruction.gapFill',
  'listen-type': 'practice.instruction.listenType',
  matching: 'practice.instruction.matching',
};

const WORD_INCLUDE = {
  topics: { select: { slug: true } },
  senses: {
    orderBy: { order: 'asc' },
    take: 1,
    include: {
      examples: { orderBy: { id: 'asc' } },
      relations: {
        where: { kind: 'synonym' },
        include: { toSense: { include: { word: { select: { lemma: true } } } } },
      },
    },
  },
} satisfies Prisma.WordInclude;

type PracticeWord = Prisma.WordGetPayload<{ include: typeof WORD_INCLUDE }>;

/** Stable, unguessable option identity: the same option keeps its id, but the id says nothing about being right. */
function optionId(exerciseId: string, wordId: string): string {
  return createHash('sha256').update(`${exerciseId}:${wordId}`).digest('hex').slice(0, 12);
}

function toCandidate(word: PracticeWord): DistractorCandidate {
  const sense = word.senses[0];
  return {
    wordId: word.id,
    lemma: word.lemma,
    pos: sense?.pos ?? 'NOUN',
    cefr: word.cefr,
    topicSlugs: word.topics.map((topic) => topic.slug),
    frequencyRank: word.frequencyRank,
    definitionVi: sense?.definitionVi ?? '',
    synonyms: (sense?.relations ?? []).map((relation) => relation.toSense.word.lemma),
  };
}

/**
 * §7.3.4 — generates the five vocabulary exercise formats.
 *
 * Generated items are stored as real `Exercise` rows rather than kept in
 * memory: the answer then never travels to the browser, every attempt lands in
 * `ExerciseAttempt` where analytics and achievements can see it, and a learner
 * who reloads mid-session does not lose the questions.
 */
@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async create(userId: string, request: VocabPracticeRequest): Promise<PracticeSet> {
    const targets = await this.pickTargets(userId, request);
    if (targets.length === 0) {
      throw AppException.notFound(
        'Từ để luyện tập',
        'Hãy học một vài từ mới trước khi luyện tập.',
      );
    }

    const pool = await this.loadPool(targets);
    const session = await this.prisma.studySession.create({
      data: { userId, skill: 'VOCABULARY' },
    });

    const items: PracticeItem[] = [];
    const seed = Number.parseInt(session.id.slice(-8), 36) || 1;

    for (const [index, word] of targets.entries()) {
      const mode = request.modes[index % request.modes.length] as VocabExerciseMode;
      const built = await this.materialise(word, mode, pool, seed + index);
      if (built) items.push(built);
    }

    if (items.length === 0) {
      throw AppException.notFound('Bài luyện tập', 'Chưa đủ dữ liệu để tạo bài tập.');
    }

    return {
      sessionId: session.id,
      items: seededShuffle(items, seed),
      total: items.length,
    };
  }

  /**
   * Words the learner has already met come first — practice is for
   * consolidating, not for meeting a word for the first time — then the topic
   * fills the gap when the collection is still small.
   */
  private async pickTargets(
    userId: string,
    request: VocabPracticeRequest,
  ): Promise<PracticeWord[]> {
    if (request.wordIds && request.wordIds.length > 0) {
      return this.prisma.word.findMany({
        where: { id: { in: request.wordIds } },
        include: WORD_INCLUDE,
      });
    }

    const topicFilter = request.topicSlug
      ? { topics: { some: { slug: request.topicSlug } } }
      : {};

    const mine = await this.prisma.word.findMany({
      where: { ...topicFilter, userWords: { some: { userId } } },
      include: WORD_INCLUDE,
      orderBy: { lemma: 'asc' },
      take: request.count,
    });

    if (mine.length >= request.count) return mine;

    const filler = await this.prisma.word.findMany({
      where: {
        ...topicFilter,
        id: { notIn: mine.map((word) => word.id) },
      },
      include: WORD_INCLUDE,
      orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { lemma: 'asc' }],
      take: request.count - mine.length,
    });

    return [...mine, ...filler];
  }

  /** Every word that shares a topic with a target is a possible distractor. */
  private async loadPool(targets: PracticeWord[]): Promise<DistractorCandidate[]> {
    const topicSlugs = [...new Set(targets.flatMap((word) => word.topics.map((t) => t.slug)))];
    const rows = await this.prisma.word.findMany({
      where: topicSlugs.length > 0 ? { topics: { some: { slug: { in: topicSlugs } } } } : {},
      include: WORD_INCLUDE,
      take: 400,
    });
    return rows.map(toCandidate);
  }

  /**
   * Create the exercise row for this word and mode if it does not exist yet,
   * then return the learner-facing item with the options freshly shuffled.
   */
  private async materialise(
    word: PracticeWord,
    mode: VocabExerciseMode,
    pool: DistractorCandidate[],
    seed: number,
  ): Promise<PracticeItem | null> {
    const sense = word.senses[0];
    if (!sense) return null;

    const id = `vp_${MODE_CODE[mode]}_${word.id}`;
    const existing = await this.prisma.exercise.findUnique({ where: { id } });
    const body = existing
      ? (existing.body as Record<string, unknown>)
      : await this.buildBody(id, word, mode, pool, seed);
    if (!body) return null;

    if (!existing) {
      const answer = body.__answer as Prisma.InputJsonValue;
      delete body.__answer;
      await this.prisma.exercise.create({
        data: {
          id,
          type: MODE_TYPE[mode],
          cefr: word.cefr,
          skill: 'VOCABULARY',
          prompt: String(body.prompt ?? word.lemma),
          promptVi: sense.definitionVi,
          body: body as Prisma.InputJsonValue,
          answer,
          explanationVi: this.explain(word, mode),
          tags: ['vocabulary', mode, ...word.topics.map((topic) => topic.slug)],
        },
      });
    }

    return this.toPublicItem(id, word, mode, body, seed);
  }

  /** §5.5 — the explanation is mandatory: never just right or wrong. */
  private explain(word: PracticeWord, mode: VocabExerciseMode): string {
    const sense = word.senses[0];
    const pos = sense ? POS_LABEL_VI[sense.pos] : '';
    const example = sense?.examples[0];
    const head = `${word.lemma}${word.ipaUs ? ` ${word.ipaUs}` : ''} (${pos}): ${sense?.definitionVi ?? ''}`;
    const tail = example ? ` Ví dụ: ${example.textEn} — ${example.textVi}` : '';
    const note =
      mode === 'gap-fill'
        ? ' Chú ý dạng của từ trong câu, không phải lúc nào cũng là dạng nguyên thể.'
        : mode === 'listen-type'
          ? ' Nghe kỹ âm cuối và trọng âm khi viết lại.'
          : '';
    return `${head}${tail}${note}`;
  }

  /**
   * The stored shape of one exercise. `__answer` rides along here and is moved
   * into the `answer` column before the row is written, so it never becomes
   * part of the body the client can read.
   */
  private async buildBody(
    id: string,
    word: PracticeWord,
    mode: VocabExerciseMode,
    pool: DistractorCandidate[],
    seed: number,
  ): Promise<Record<string, unknown> | null> {
    const sense = word.senses[0];
    if (!sense) return null;
    const target = toCandidate(word);

    if (mode === 'mcq-meaning' || mode === 'mcq-reverse') {
      const wrong = pickDistractors(target, pool, { count: DISTRACTOR_COUNT, seed });
      if (wrong.length < DISTRACTOR_COUNT) return null;

      const options = [target, ...wrong].map((candidate) => ({
        id: optionId(id, candidate.wordId),
        text: mode === 'mcq-meaning' ? candidate.definitionVi : candidate.lemma,
        hint: mode === 'mcq-meaning' ? POS_LABEL_VI[candidate.pos as keyof typeof POS_LABEL_VI] : undefined,
      }));

      return {
        prompt: mode === 'mcq-meaning' ? word.lemma : sense.definitionVi,
        promptIpa: mode === 'mcq-meaning' ? word.ipaUs : null,
        promptAudioUrl: mode === 'mcq-meaning' ? word.audioUsUrl : null,
        options,
        __answer: { optionId: optionId(id, word.id) },
      };
    }

    if (mode === 'gap-fill') {
      const example = sense.examples.find((item) => item.highlightEnd > item.highlightStart);
      if (!example) return null;
      const blanked = blankOut(example.textEn, example.highlightStart, example.highlightEnd);
      if (!blanked) return null;

      return {
        prompt: blanked.prompt,
        translation: example.textVi,
        hint: gapHint(blanked.answer),
        pos: POS_LABEL_VI[sense.pos],
        __answer: { value: blanked.answer },
      };
    }

    if (mode === 'listen-type') {
      return {
        audioUrl: word.audioUsUrl,
        speakText: word.lemma,
        definitionVi: sense.definitionVi,
        hint: gapHint(word.lemma),
        __answer: { value: word.lemma },
      };
    }

    const partners = pickDistractors(target, pool, { count: MATCHING_SIZE - 1, seed });
    if (partners.length < MATCHING_SIZE - 1) return null;
    const members = [target, ...partners];

    // Left and right ids are derived from different salts, so a matching item
    // cannot be solved by lining up identical option ids.
    return {
      prompt: 'Nối từ với nghĩa đúng',
      left: members.map((member) => ({
        id: optionId(`${id}:L`, member.wordId),
        text: member.lemma,
      })),
      right: members.map((member) => ({
        id: optionId(`${id}:R`, member.wordId),
        text: member.definitionVi,
      })),
      __answer: {
        pairs: Object.fromEntries(
          members.map((member) => [
            optionId(`${id}:L`, member.wordId),
            optionId(`${id}:R`, member.wordId),
          ]),
        ),
      },
    };
  }

  /** Strip anything the learner must not see and reshuffle the options. */
  private toPublicItem(
    id: string,
    word: PracticeWord,
    mode: VocabExerciseMode,
    body: Record<string, unknown>,
    seed: number,
  ): PracticeItem {
    const base = {
      id,
      wordId: word.id,
      lemma: word.lemma,
      instructionKey: MODE_INSTRUCTION[mode],
    };

    if (mode === 'mcq-meaning' || mode === 'mcq-reverse') {
      return {
        ...base,
        mode,
        prompt: String(body.prompt ?? ''),
        promptIpa: (body.promptIpa as string | null) ?? null,
        promptAudioUrl: (body.promptAudioUrl as string | null) ?? null,
        options: seededShuffle((body.options as PracticeOption[]) ?? [], seed),
      };
    }

    if (mode === 'gap-fill') {
      return {
        ...base,
        mode,
        prompt: String(body.prompt ?? ''),
        translation: String(body.translation ?? ''),
        hint: String(body.hint ?? ''),
        pos: String(body.pos ?? ''),
      };
    }

    if (mode === 'listen-type') {
      return {
        ...base,
        mode,
        audioUrl: (body.audioUrl as string | null) ?? null,
        speakText: String(body.speakText ?? word.lemma),
        definitionVi: String(body.definitionVi ?? ''),
        hint: String(body.hint ?? ''),
      };
    }

    return {
      ...base,
      mode: 'matching',
      left: seededShuffle((body.left as PracticeOption[]) ?? [], seed),
      right: seededShuffle((body.right as PracticeOption[]) ?? [], seed + 7),
    };
  }

  /** Grade a finished set, record every attempt, and pay out once. */
  async submit(
    userId: string,
    input: PracticeSubmitInput,
    now = new Date(),
  ): Promise<PracticeResult> {
    const session = await this.prisma.studySession.findUnique({
      where: { id: input.sessionId },
    });
    if (!session || session.userId !== userId) throw AppException.notFound('Phiên luyện tập');
    if (session.endedAt) throw AppException.conflict('ATTEMPT_ALREADY_SUBMITTED', 'Phiên này đã được chấm rồi.');

    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: input.answers.map((answer) => answer.itemId) } },
    });
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

    // The prompt is the definition for reverse questions, so the word each
    // exercise is about is read from its deterministic id instead.
    const wordIds = exercises.map((exercise) => wordIdOf(exercise.id));
    const words = await this.prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: { id: true, lemma: true },
    });
    const lemmaOf = new Map(words.map((word) => [word.id, word.lemma]));

    const results: PracticeResult['results'] = [];
    let correct = 0;
    let scoreSum = 0;

    for (const answer of input.answers) {
      const exercise = byId.get(answer.itemId);
      if (!exercise) continue;

      const wordId = wordIdOf(exercise.id);
      const graded = gradeAnswer(exercise.answer, answer.answer);
      if (graded.isCorrect) correct += 1;
      scoreSum += graded.score;

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
            skill: 'VOCABULARY',
            category: `vocabulary-${exercise.type.toLowerCase()}`,
            detail: exercise.prompt,
            sourceType: 'vocab-practice',
            sourceId: exercise.id,
            occurredAt: now,
          },
        });
      }

      results.push({
        itemId: exercise.id,
        wordId,
        lemma: lemmaOf.get(wordId) ?? exercise.prompt,
        isCorrect: graded.isCorrect,
        score: graded.score,
        correctAnswer: graded.expected,
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
      skill: 'VOCABULARY',
      refType: 'study_session',
      refId: session.id,
      accuracy,
      studySeconds: durationSec,
      // One assessed observation per session, not per question (§9.7).
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

/** Short codes keep the deterministic exercise ids readable in the database. */
const MODE_CODE: Record<VocabExerciseMode, string> = {
  'mcq-meaning': 'mcqm',
  'mcq-reverse': 'mcqr',
  'gap-fill': 'gap',
  'listen-type': 'lis',
  matching: 'mat',
};

interface GradedAnswer {
  isCorrect: boolean;
  score: number;
  expected: string;
}

/**
 * One grader for all five formats. Typed answers are compared the forgiving way
 * §7.5 asks for: case and punctuation are ignored, and a one letter slip is
 * worth half a point rather than nothing.
 */
export function gradeAnswer(stored: unknown, given: string): GradedAnswer {
  const answer = (stored ?? {}) as {
    optionId?: string;
    value?: string;
    pairs?: Record<string, string>;
  };

  if (typeof answer.optionId === 'string') {
    return {
      isCorrect: given === answer.optionId,
      score: given === answer.optionId ? 1 : 0,
      expected: answer.optionId,
    };
  }

  if (typeof answer.value === 'string') {
    const graded = gradeGapFill(answer.value, given);
    return { isCorrect: graded.isCorrect, score: graded.score, expected: answer.value };
  }

  if (answer.pairs) {
    const expectedPairs = answer.pairs;
    const total = Object.keys(expectedPairs).length;
    let matched = 0;
    for (const pair of parsePairs(given)) {
      if (expectedPairs[pair.left] === pair.right) matched += 1;
    }
    const score = total === 0 ? 0 : matched / total;
    return {
      isCorrect: total > 0 && matched === total,
      score,
      expected: Object.entries(expectedPairs)
        .map(([left, right]) => `${left}:${right}`)
        .join(','),
    };
  }

  return { isCorrect: false, score: 0, expected: '' };
}

/** Matching answers arrive as "leftId:rightId,leftId:rightId". */
function parsePairs(given: string): { left: string; right: string }[] {
  return given
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [left = '', right = ''] = entry.split(':');
      return { left, right };
    });
}

/** Exercise ids are `vp_<mode>_<wordId>`; cuids never contain an underscore. */
export function wordIdOf(exerciseId: string): string {
  return exerciseId.split('_')[2] ?? '';
}
