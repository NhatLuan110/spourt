import type { Exercise } from '@prisma/client';
import { seededShuffle } from '@sprout/shared';
import type { LessonExercise, PracticeOption } from '@sprout/shared';

/**
 * Turns an `Exercise` row into the wire shape, dropping the `answer` column on
 * the way out. Nothing else in the API is allowed to serialise an Exercise, so
 * there is exactly one place where forgetting to strip the answer is possible.
 */

interface StoredOption {
  id?: unknown;
  text?: unknown;
}

function readOptions(value: unknown): PracticeOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const option = entry as StoredOption;
    if (typeof option.id !== 'string' || typeof option.text !== 'string') return [];
    return [{ id: option.id, text: option.text }];
  });
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toLessonExercise(row: Exercise, seed: number): LessonExercise | null {
  const body = (row.body ?? {}) as Record<string, unknown>;
  const base = {
    id: row.id,
    prompt: row.prompt,
    promptVi: row.promptVi,
    order: row.order,
  };

  switch (body['mode']) {
    case 'mcq':
      return {
        ...base,
        mode: 'mcq',
        // Shuffled per set so the correct answer is not always in the position
        // the content author happened to write it in.
        options: seededShuffle(readOptions(body['options']), seed + row.order),
      };
    case 'gap-fill':
      return { ...base, mode: 'gap-fill', hint: readString(body, 'hint'), root: readString(body, 'root') };
    case 'true-false':
      return { ...base, mode: 'true-false', statement: readString(body, 'statement') ?? row.prompt };
    case 'reorder':
      return {
        ...base,
        mode: 'reorder',
        chunks: seededShuffle(readOptions(body['chunks']), seed + row.order),
      };
    case 'short-answer':
      return { ...base, mode: 'short-answer', hint: readString(body, 'hint') };
    case 'dictation': {
      const wordCount = body['wordCount'];
      const segmentOrder = body['segmentOrder'];
      return {
        ...base,
        mode: 'dictation',
        audioUrl: readString(body, 'audioUrl'),
        speakText: readString(body, 'speakText') ?? '',
        segmentOrder: typeof segmentOrder === 'number' ? segmentOrder : null,
        wordCount: typeof wordCount === 'number' ? wordCount : 0,
      };
    }
    default:
      return null;
  }
}

/** Maps a batch, dropping any row whose body does not match a known format. */
export function toLessonExercises(rows: Exercise[], seed: number): LessonExercise[] {
  return rows.flatMap((row) => {
    const item = toLessonExercise(row, seed);
    return item ? [item] : [];
  });
}
