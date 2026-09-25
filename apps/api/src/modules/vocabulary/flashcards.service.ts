import { Injectable } from '@nestjs/common';
import { seededShuffle } from '@sprout/shared';
import type {
  CefrLevel,
  FlashcardDeckView,
  FlashcardDirection,
  FlashcardFace,
  FlashcardQuery,
  FlashcardRateInput,
  FlashcardRateResult,
  FlashcardView,
} from '@sprout/shared';
import { AppException } from '@app/common/exceptions/app.exception';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

/**
 * §7.3 flashcards — flipping through a deck, in the style learners already know
 * from Quizlet and Study4.
 *
 * This is not a second spaced-repetition system. It reads and writes the same
 * `UserWord` rows the SRS queue uses, so a word marked "chưa thuộc" here turns
 * up in tomorrow's review, and a word already in the schedule keeps its state.
 * What it adds is a browsing mode with no scheduling opinion: any order, either
 * direction, as many passes as the learner wants.
 */
@Injectable()
export class FlashcardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async deck(userId: string, query: FlashcardQuery, now = new Date()): Promise<FlashcardDeckView> {
    const { words, title } = await this.wordsFor(userId, query, now);

    const userWords = await this.prisma.userWord.findMany({
      where: { userId, wordId: { in: words.map((word) => word.id) } },
      select: { wordId: true, state: true, dueAt: true },
    });
    const byWord = new Map(userWords.map((row) => [row.wordId, row]));

    let selected = words;
    if (query.unknownOnly) {
      selected = words.filter((word) => {
        const state = byWord.get(word.id)?.state;
        return state === undefined || state === 'NEW' || state === 'LEARNING' || state === 'RELEARNING';
      });
    }

    // A seed derived from the day keeps the order stable across a refresh while
    // still differing between sessions on different days.
    const ordered = query.shuffle
      ? seededShuffle(selected, Math.floor(now.getTime() / 60_000))
      : selected;

    const cards = ordered.slice(0, query.limit).map((word) => {
      const userWord = byWord.get(word.id);
      return this.toCard(word, query.direction, {
        state: userWord?.state ?? null,
        due: userWord?.dueAt !== undefined && userWord.dueAt !== null && userWord.dueAt <= now,
      });
    });

    return {
      source: query.source,
      ref: query.ref ?? null,
      title,
      cards,
      total: selected.length,
    };
  }

  /**
   * Records a self-rating.
   *
   * "Chưa thuộc" on a word the learner has never studied creates the `UserWord`
   * row due immediately, which is what makes flashcards a way *into* the review
   * schedule rather than a parallel track that never feeds it.
   */
  async rate(
    userId: string,
    input: FlashcardRateInput,
    now = new Date(),
  ): Promise<FlashcardRateResult> {
    const word = await this.prisma.word.findUnique({
      where: { id: input.wordId },
      select: { id: true },
    });
    if (!word) throw AppException.notFound('Từ');

    const existing = await this.prisma.userWord.findUnique({
      where: { userId_wordId: { userId, wordId: input.wordId } },
    });

    if (input.known) {
      // Knowing a word the learner has never formally studied is not evidence
      // enough to mark it mastered, so nothing is created. Saying "I know this"
      // about an untracked word simply moves on.
      if (!existing) {
        return { wordId: input.wordId, state: 'NEW', enqueued: false, dueAt: null };
      }
      return {
        wordId: input.wordId,
        state: existing.state,
        enqueued: false,
        dueAt: existing.dueAt?.toISOString() ?? null,
      };
    }

    const row = existing
      ? await this.prisma.userWord.update({
          where: { userId_wordId: { userId, wordId: input.wordId } },
          // An existing card is pulled forward to now rather than rescheduled:
          // the learner has just told us they cannot recall it.
          data: { dueAt: now },
        })
      : await this.prisma.userWord.create({
          data: {
            userId,
            wordId: input.wordId,
            state: 'NEW',
            dueAt: now,
            sourceType: 'flashcard',
          },
        });

    await this.gamification.recordStudyTime({
      userId,
      skill: 'VOCABULARY',
      seconds: Math.round(input.timeSpentMs / 1000),
      now,
    });

    return {
      wordId: input.wordId,
      state: row.state,
      enqueued: existing === null,
      dueAt: row.dueAt?.toISOString() ?? null,
    };
  }

  private async wordsFor(userId: string, query: FlashcardQuery, now: Date) {
    const select = {
      id: true,
      slug: true,
      lemma: true,
      cefr: true,
      ipaUs: true,
      ipaUk: true,
      audioUsUrl: true,
      audioUkUrl: true,
      senses: {
        orderBy: { order: 'asc' as const },
        take: 1,
        select: {
          pos: true,
          definitionVi: true,
          examples: {
            // Example has no order column, so id keeps the choice stable
            // between reads rather than leaving it to the database.
            orderBy: { id: 'asc' as const },
            take: 1,
            select: { textEn: true, textVi: true },
          },
        },
      },
    };

    switch (query.source) {
      case 'deck': {
        if (!query.ref) throw AppException.validation({ ref: 'required' }, 'Cần chọn bộ thẻ.');
        const deck = await this.prisma.deck.findUnique({
          where: { id: query.ref },
          select: { id: true, name: true, userId: true, isPublic: true },
        });
        if (!deck || (deck.userId !== userId && !deck.isPublic)) {
          throw AppException.notFound('Bộ thẻ');
        }
        const items = await this.prisma.deckItem.findMany({
          where: { deckId: deck.id },
          orderBy: { order: 'asc' },
          select: { word: { select } },
        });
        return { words: items.flatMap((item) => (item.word ? [item.word] : [])), title: deck.name };
      }

      case 'collection': {
        const rows = await this.prisma.userWord.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { word: { select } },
        });
        return { words: rows.flatMap((row) => (row.word ? [row.word] : [])), title: 'Bộ từ của tôi' };
      }

      case 'due': {
        const rows = await this.prisma.userWord.findMany({
          where: { userId, dueAt: { lte: now } },
          orderBy: { dueAt: 'asc' },
          take: 200,
          select: { word: { select } },
        });
        return { words: rows.flatMap((row) => (row.word ? [row.word] : [])), title: 'Đến hạn ôn' };
      }

      default: {
        if (!query.ref) throw AppException.validation({ ref: 'required' }, 'Cần chọn chủ đề.');
        const topic = await this.prisma.topic.findUnique({
          where: { slug: query.ref },
          select: { id: true, nameVi: true },
        });
        if (!topic) throw AppException.notFound('Chủ đề');
        const words = await this.prisma.word.findMany({
          where: { topics: { some: { id: topic.id } } },
          orderBy: { frequencyRank: 'asc' },
          take: 200,
          select,
        });
        return { words, title: topic.nameVi };
      }
    }
  }

  private toCard(
    word: WordRow,
    direction: FlashcardDirection,
    meta: { state: string | null; due: boolean },
  ): FlashcardView {
    const sense = word.senses[0];
    const example = sense?.examples[0];

    const english: FlashcardFace = {
      primary: word.lemma,
      secondary: sense?.pos ?? null,
      ipa: word.ipaUs ?? word.ipaUk,
      audioUrl: word.audioUsUrl ?? word.audioUkUrl,
      speakText: word.lemma,
    };
    const vietnamese: FlashcardFace = {
      primary: sense?.definitionVi ?? word.lemma,
      secondary: sense?.pos ?? null,
      ipa: null,
      audioUrl: null,
      speakText: null,
    };

    // "mixed" is decided per card rather than per session, so one pass through
    // the deck exercises both directions.
    const showEnglishFirst =
      direction === 'en-vi' || (direction === 'mixed' && hashToBool(word.id));

    return {
      wordId: word.id,
      slug: word.slug,
      lemma: word.lemma,
      cefr: word.cefr,
      front: showEnglishFirst ? english : vietnamese,
      back: showEnglishFirst ? vietnamese : english,
      example: example ? { en: example.textEn, vi: example.textVi } : null,
      learnState: meta.state,
      due: meta.due,
    };
  }
}

interface WordRow {
  id: string;
  slug: string;
  lemma: string;
  cefr: CefrLevel;
  ipaUs: string | null;
  ipaUk: string | null;
  audioUsUrl: string | null;
  audioUkUrl: string | null;
  senses: {
    pos: string;
    definitionVi: string;
    examples: { textEn: string; textVi: string }[];
  }[];
}

/** Stable per word, so "mixed" gives the same card the same direction on a re-read. */
function hashToBool(id: string): boolean {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return (hash & 1) === 0;
}
