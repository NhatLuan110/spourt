import { z } from 'zod';
import { CEFR_LEVELS } from '../constants/cefr.js';
import { SKILLS } from '../constants/skills.js';

export const cefrLevelSchema = z.enum(CEFR_LEVELS);
export const skillSchema = z.enum(SKILLS);

/** §6.1 — pagination is page-based, with an optional cursor for long lists. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable().optional(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export interface ApiEnvelope<T> {
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const idParamSchema = z.object({ id: z.string().min(1) });
export const slugParamSchema = z.object({ slug: z.string().min(1) });

/** §6.1 — idempotency key for any mutation that awards XP. */
export const idempotencyKeySchema = z.string().min(8).max(128);
