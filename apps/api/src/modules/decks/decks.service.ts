import { Injectable } from '@nestjs/common';
import type {
  AddDeckItemsInput,
  CreateDeckInput,
  DeckDetail,
  DeckSummary,
  ReorderDeckItemsInput,
  UpdateDeckInput,
} from '@sprout/shared';
import { PrismaService } from '@app/infra/prisma/prisma.service';
import { AppException } from '@app/common/exceptions/app.exception';

/** §7.3.7 — decks the learner builds by hand, on top of the shared dictionary. */
@Injectable()
export class DecksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, now = new Date()): Promise<DeckSummary[]> {
    const decks = await this.prisma.deck.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });

    return Promise.all(
      decks.map(async (deck) => ({
        id: deck.id,
        name: deck.name,
        description: deck.description,
        emoji: deck.emoji,
        isPublic: deck.isPublic,
        itemCount: deck._count.items,
        dueCount: await this.prisma.userWord.count({
          where: {
            userId,
            dueAt: { lte: now },
            state: { notIn: ['NEW', 'SUSPENDED'] },
            word: { deckItems: { some: { deckId: deck.id } } },
          },
        }),
        createdAt: deck.createdAt.toISOString(),
        updatedAt: deck.updatedAt.toISOString(),
      })),
    );
  }

  async detail(userId: string, deckId: string, now = new Date()): Promise<DeckDetail> {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
      include: {
        _count: { select: { items: true } },
        items: {
          orderBy: { order: 'asc' },
          include: {
            word: {
              include: {
                senses: { orderBy: { order: 'asc' }, take: 1, select: { definitionVi: true } },
              },
            },
          },
        },
      },
    });

    if (!deck || (deck.userId !== userId && !deck.isPublic)) throw AppException.notFound('Bộ thẻ');

    const wordIds = deck.items
      .map((item) => item.wordId)
      .filter((id): id is string => Boolean(id));
    const states = await this.prisma.userWord.findMany({
      where: { userId, wordId: { in: wordIds } },
      select: { wordId: true, state: true, dueAt: true },
    });
    const byWord = new Map(states.map((row) => [row.wordId, row]));

    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      emoji: deck.emoji,
      isPublic: deck.isPublic,
      itemCount: deck._count.items,
      dueCount: states.filter(
        (row) => row.dueAt.getTime() <= now.getTime() && row.state !== 'NEW',
      ).length,
      createdAt: deck.createdAt.toISOString(),
      updatedAt: deck.updatedAt.toISOString(),
      items: deck.items.map((item) => {
        const state = item.wordId ? byWord.get(item.wordId) : undefined;
        return {
          id: item.id,
          order: item.order,
          wordId: item.wordId,
          lemma: item.word?.lemma ?? null,
          slug: item.word?.slug ?? null,
          ipaUs: item.word?.ipaUs ?? null,
          audioUsUrl: item.word?.audioUsUrl ?? null,
          definitionVi: item.word?.senses[0]?.definitionVi ?? null,
          customFront: item.customFront,
          customBack: item.customBack,
          learnState: state?.state ?? null,
          dueAt: state?.dueAt.toISOString() ?? null,
        };
      }),
    };
  }

  async create(userId: string, input: CreateDeckInput): Promise<DeckSummary> {
    const deck = await this.prisma.deck.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        emoji: input.emoji,
        isPublic: input.isPublic,
      },
    });

    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      emoji: deck.emoji,
      isPublic: deck.isPublic,
      itemCount: 0,
      dueCount: 0,
      createdAt: deck.createdAt.toISOString(),
      updatedAt: deck.updatedAt.toISOString(),
    };
  }

  async update(userId: string, deckId: string, input: UpdateDeckInput): Promise<DeckDetail> {
    await this.own(userId, deckId);
    await this.prisma.deck.update({
      where: { id: deckId },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description,
        emoji: input.emoji,
        isPublic: input.isPublic,
      },
    });
    return this.detail(userId, deckId);
  }

  async remove(userId: string, deckId: string): Promise<{ deleted: true }> {
    await this.own(userId, deckId);
    await this.prisma.deck.delete({ where: { id: deckId } });
    return { deleted: true };
  }

  /**
   * Adding a word to a deck also puts it in the review schedule unless the
   * learner says otherwise — a deck nobody reviews is just a list.
   */
  async addItems(
    userId: string,
    deckId: string,
    input: AddDeckItemsInput,
    now = new Date(),
  ): Promise<DeckDetail> {
    await this.own(userId, deckId);

    const wordIds = input.items
      .map((item) => item.wordId)
      .filter((id): id is string => Boolean(id));
    const known = await this.prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: { id: true },
    });
    const realWords = new Set(known.map((word) => word.id));

    const last = await this.prisma.deckItem.findFirst({
      where: { deckId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    let order = (last?.order ?? -1) + 1;

    const accepted = input.items.filter(
      (item) => (item.wordId && realWords.has(item.wordId)) || item.customFront,
    );
    if (accepted.length === 0) throw AppException.notFound('Từ để thêm vào bộ thẻ');

    await this.prisma.deckItem.createMany({
      data: accepted.map((item) => ({
        deckId,
        wordId: item.wordId && realWords.has(item.wordId) ? item.wordId : null,
        customFront: item.customFront ?? null,
        customBack: item.customBack ?? null,
        order: order++,
      })),
    });

    if (input.enqueueForReview && realWords.size > 0) {
      await this.prisma.userWord.createMany({
        data: [...realWords].map((wordId) => ({
          userId,
          wordId,
          state: 'NEW' as const,
          dueAt: now,
          sourceType: 'deck',
          sourceId: deckId,
        })),
        skipDuplicates: true,
      });
    }

    await this.prisma.deck.update({ where: { id: deckId }, data: { updatedAt: now } });
    return this.detail(userId, deckId, now);
  }

  async removeItem(userId: string, deckId: string, itemId: string): Promise<DeckDetail> {
    await this.own(userId, deckId);
    const item = await this.prisma.deckItem.findUnique({ where: { id: itemId } });
    if (!item || item.deckId !== deckId) throw AppException.notFound('Thẻ trong bộ');

    await this.prisma.deckItem.delete({ where: { id: itemId } });
    return this.detail(userId, deckId);
  }

  async reorder(
    userId: string,
    deckId: string,
    input: ReorderDeckItemsInput,
  ): Promise<DeckDetail> {
    await this.own(userId, deckId);
    const items = await this.prisma.deckItem.findMany({
      where: { deckId },
      select: { id: true },
    });
    const known = new Set(items.map((item) => item.id));
    const ordered = input.itemIds.filter((id) => known.has(id));

    await this.prisma.$transaction(
      ordered.map((id, index) =>
        this.prisma.deckItem.update({ where: { id }, data: { order: index } }),
      ),
    );

    return this.detail(userId, deckId);
  }

  private async own(userId: string, deckId: string): Promise<void> {
    const deck = await this.prisma.deck.findUnique({
      where: { id: deckId },
      select: { userId: true },
    });
    if (!deck) throw AppException.notFound('Bộ thẻ');
    if (deck.userId !== userId) throw AppException.forbidden('Bộ thẻ này không phải của bạn.');
  }
}
