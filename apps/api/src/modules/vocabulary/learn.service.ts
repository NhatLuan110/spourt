import { Injectable } from '@nestjs/common';
import type { LearnCard, LearnCommitInput, LearnSessionQuery } from '@sprout/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';
import { GamificationService } from '../gamification/gamification.service';
import { StudyDayService } from '../gamification/study-day.service';

const LEARN_INCLUDE = {
  senses: {
    orderBy: { order: 'asc' },
    include: {
      examples: { orderBy: { id: 'asc' } },
      relations: { include: { toSense: { include: { word: { select: { lemma: true } } } } } },
    },
  },
  forms: {
    include: {
      family: { include: { members: { include: { word: { select: { lemma: true, slug: true } } } } } },
    },
  },
} satisfies Prisma.WordInclude;

/** §7.3.2 — meeting new words before they enter the review schedule. */
@Injectable()
export class LearnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
    private readonly studyDay: StudyDayService,
  ) {}

  /**
   * The next words to teach: never words already in the collection, always in
   * frequency order so the most useful vocabulary is learned first, and never
   * more than the daily allowance still unspent.
   */
  async cards(userId: string, query: LearnSessionQuery, now = new Date()): Promise<{
    items: LearnCard[];
    meta: { remainingToday: number; dailyAllowance: number; introducedToday: number };
  }> {
    const clock = await this.studyDay.clockFor(userId);
    const day = this.studyDay.resolve(clock, now);
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) throw AppException.notFound('Cài đặt');

    const introducedToday = await this.prisma.userWord.count({
      where: { userId, createdAt: { gte: day.start, lt: day.end } },
    });
    const remainingToday = Math.max(0, settings.newWordsPerDay - introducedToday);
    const limit = Math.min(query.limit ?? remainingToday, remainingToday);

    if (limit <= 0) {
      return {
        items: [],
        meta: { remainingToday: 0, dailyAllowance: settings.newWordsPerDay, introducedToday },
      };
    }

    const where: Prisma.WordWhereInput = { userWords: { none: { userId } } };
    if (query.topic) where.topics = { some: { slug: query.topic } };
    if (query.deckId) where.deckItems = { some: { deckId: query.deckId } };

    const words = await this.prisma.word.findMany({
      where,
      orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { lemma: 'asc' }],
      take: limit,
      include: LEARN_INCLUDE,
    });

    return {
      items: words.map((word) => toLearnCard(word)),
      meta: { remainingToday, dailyAllowance: settings.newWordsPerDay, introducedToday },
    };
  }

  /**
   * Put the words the learner just met into the schedule. The daily allowance
   * is enforced here too: a client that asks for thirty words when five remain
   * gets five, and is told so, rather than silently blowing past the setting.
   */
  async commit(userId: string, input: LearnCommitInput, now = new Date()) {
    const clock = await this.studyDay.clockFor(userId);
    const day = this.studyDay.resolve(clock, now);
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) throw AppException.notFound('Cài đặt');

    const introducedToday = await this.prisma.userWord.count({
      where: { userId, createdAt: { gte: day.start, lt: day.end } },
    });
    const allowance = Math.max(0, settings.newWordsPerDay - introducedToday);

    const known = await this.prisma.userWord.findMany({
      where: { userId, wordId: { in: input.wordIds } },
      select: { wordId: true },
    });
    const alreadyKnown = new Set(known.map((row) => row.wordId));

    const existing = await this.prisma.word.findMany({
      where: { id: { in: input.wordIds } },
      select: { id: true },
    });
    const real = new Set(existing.map((row) => row.id));

    const accepted = input.wordIds
      .filter((id) => real.has(id) && !alreadyKnown.has(id))
      .slice(0, allowance);

    if (accepted.length === 0) {
      return {
        added: 0,
        skipped: input.wordIds.length,
        remainingToday: allowance,
        reward: null,
      };
    }

    await this.prisma.userWord.createMany({
      data: accepted.map((wordId) => ({
        userId,
        wordId,
        state: 'NEW' as const,
        dueAt: now,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        createdAt: now,
      })),
      skipDuplicates: true,
    });

    // §9.2 — 5 XP per new word, paid once, in a single award for the session.
    const reward = await this.gamification.award({
      userId,
      source: 'NEW_WORD',
      skill: 'VOCABULARY',
      refType: 'topic',
      refId: input.sourceId ?? input.sourceType,
      quantity: accepted.length,
      wordsLearned: accepted.length,
      now,
    });

    return {
      added: accepted.length,
      skipped: input.wordIds.length - accepted.length,
      remainingToday: allowance - accepted.length,
      reward,
    };
  }
}

type LearnWordRow = Prisma.WordGetPayload<{ include: typeof LEARN_INCLUDE }>;

export function toLearnCard(word: LearnWordRow, alreadyLearning = false): LearnCard {
  const family = word.forms[0]?.family ?? null;

  return {
    wordId: word.id,
    lemma: word.lemma,
    slug: word.slug,
    cefr: word.cefr,
    ipaUs: word.ipaUs,
    ipaUk: word.ipaUk,
    audioUsUrl: word.audioUsUrl,
    audioUkUrl: word.audioUkUrl,
    syllables: word.syllables,
    stressPattern: word.stressPattern,
    senses: word.senses.map((sense) => ({
      id: sense.id,
      pos: sense.pos,
      definitionEn: sense.definitionEn,
      definitionVi: sense.definitionVi,
      register: sense.register,
      examples: sense.examples.map((example) => ({
        textEn: example.textEn,
        textVi: example.textVi,
        highlightStart: example.highlightStart,
        highlightEnd: example.highlightEnd,
      })),
    })),
    synonyms: [
      ...new Set(
        word.senses.flatMap((sense) =>
          sense.relations
            .filter((relation) => relation.kind === 'synonym')
            .map((relation) => relation.toSense.word.lemma),
        ),
      ),
    ],
    antonyms: [
      ...new Set(
        word.senses.flatMap((sense) =>
          sense.relations
            .filter((relation) => relation.kind === 'antonym')
            .map((relation) => relation.toSense.word.lemma),
        ),
      ),
    ],
    family: family
      ? family.members
          .filter((member) => member.wordId !== word.id)
          .map((member) => ({
            lemma: member.word.lemma,
            slug: member.word.slug,
            pos: member.pos,
            suffix: member.suffix,
          }))
      : [],
    alreadyLearning,
  };
}
