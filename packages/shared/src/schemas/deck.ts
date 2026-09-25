import { z } from 'zod';

export const deckIdParamSchema = z.object({ deckId: z.string().min(1) });

export const updateDeckSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  emoji: z.string().min(1).max(8).optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;

export const reorderDeckItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(500),
});
export type ReorderDeckItemsInput = z.infer<typeof reorderDeckItemsSchema>;

export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  isPublic: boolean;
  itemCount: number;
  dueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckItemView {
  id: string;
  order: number;
  wordId: string | null;
  lemma: string | null;
  slug: string | null;
  ipaUs: string | null;
  audioUsUrl: string | null;
  definitionVi: string | null;
  customFront: string | null;
  customBack: string | null;
  learnState: string | null;
  dueAt: string | null;
}

export interface DeckDetail extends DeckSummary {
  items: DeckItemView[];
}
