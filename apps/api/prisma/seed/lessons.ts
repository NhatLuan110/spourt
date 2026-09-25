import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { CefrLevel, ExerciseType, Prisma, PrismaClient } from '@prisma/client';
import { countWords } from '@sprout/shared';

/**
 * Seeds grammar lessons, reading passages and listening tracks from
 * `content/{grammar,reading,listening}/*.yaml`.
 *
 * Exercise ids are derived from the parent slug and the order, so re-running the
 * seed updates the same rows instead of piling up duplicates and orphaning every
 * `ExerciseAttempt` a learner has already made.
 */

export interface ExerciseFile {
  type: ExerciseType;
  prompt: string;
  promptVi?: string;
  explanationVi: string;
  options?: string[];
  answer?: string | boolean;
  accept?: string[];
  chunks?: string[];
  statement?: string;
  hint?: boolean;
}

interface LessonFile {
  slug: string;
  title: string;
  titleVi: string;
  summary: string;
  estimatedMinutes: number;
  xpReward: number;
  order: number;
  prerequisites?: string[];
  sections: { kind: string; title: string; body: string }[];
  exercises: ExerciseFile[];
}

/**
 * Một mục chú giải: hoặc chỉ là từ cần tra, hoặc kèm luôn nghĩa do người soạn
 * viết sẵn. Dạng thứ hai cần thiết cho những từ hiếm không có trong kho từ vựng
 * — tra bảng Word sẽ không ra gì và người học chỉ nhận được ô nghĩa trống.
 */
type GlossaryEntry =
  | string
  | { term?: string; word?: string; definitionVi?: string; meaningVi?: string; definition?: string };

interface PassageFile {
  slug: string;
  title: string;
  titleVi: string;
  topic?: string;
  estimatedMinutes: number;
  source?: string;
  glossary?: GlossaryEntry[];
  body: string;
  questions: ExerciseFile[];
}

interface TrackFile {
  slug: string;
  title: string;
  titleVi: string;
  topic?: string;
  accent: string;
  format: string;
  speakerCount: number;
  glossary?: string[];
  segments: { speaker?: string; text: string; vi?: string }[];
  dictation?: number[];
  questions: ExerciseFile[];
}

function optionId(exerciseId: string, index: number): string {
  return createHash('sha256').update(`${exerciseId}:${index}`).digest('hex').slice(0, 12);
}

/** "recycle" -> "r______" — enough to unblock, not enough to give it away. */
function gapHint(answer: string): string {
  const first = answer.trim().charAt(0);
  return first === '' ? '' : first + '_'.repeat(Math.max(0, answer.trim().length - 1));
}

/**
 * Turns one content-file exercise into the `body` and `answer` columns. The
 * answer never leaves the server, so the split matters: everything the client
 * may see goes in `body`, everything it may not goes in `answer`.
 */
export function buildExercise(
  id: string,
  entry: ExerciseFile,
  order: number,
): { body: Prisma.InputJsonValue; answer: Prisma.InputJsonValue } {
  switch (entry.type) {
    case 'MCQ': {
      const options = entry.options ?? [];
      const correct = options.findIndex((text) => text === entry.answer);
      if (correct < 0) {
        throw new Error(`MCQ ${id}: đáp án "${String(entry.answer)}" không có trong options`);
      }
      return {
        body: { mode: 'mcq', options: options.map((text, i) => ({ id: optionId(id, i), text })) },
        answer: { optionId: optionId(id, correct) },
      };
    }
    case 'GAP_FILL': {
      const primary = String(entry.answer ?? '');
      const accept = entry.accept?.length ? entry.accept : [primary];
      return {
        body: { mode: 'gap-fill', hint: entry.hint === false ? null : gapHint(primary) },
        answer: { accept, display: primary },
      };
    }
    case 'TRUE_FALSE':
      return {
        body: { mode: 'true-false', statement: entry.statement ?? '' },
        answer: { value: entry.answer === true },
      };
    case 'REORDER': {
      const chunks = entry.chunks ?? [];
      const withIds = chunks.map((text, i) => ({ id: optionId(id, i), text }));
      return {
        body: { mode: 'reorder', chunks: withIds },
        answer: { order: withIds.map((c) => c.id), sentence: chunks.join(' ') },
      };
    }
    case 'SHORT_ANSWER': {
      const accept = entry.accept ?? (entry.answer ? [String(entry.answer)] : []);
      if (accept.length === 0) throw new Error(`SHORT_ANSWER ${id}: thiếu accept`);
      return {
        body: { mode: 'short-answer', hint: entry.hint === true ? gapHint(accept[0] ?? '') : null },
        answer: { accept, display: accept[0] ?? '' },
      };
    }
    case 'DICTATION': {
      const text = String(entry.answer ?? '');
      return {
        body: {
          mode: 'dictation',
          speakText: text,
          segmentOrder: order,
          wordCount: countWords(text),
        },
        answer: { text },
      };
    }
    default:
      throw new Error(`Loại bài tập chưa hỗ trợ: ${entry.type}`);
  }
}

function readFiles<T>(contentDir: string, kind: string): { file: string; doc: T }[] {
  const dir = join(contentDir, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((file) => ({ file, doc: parse(readFileSync(join(dir, file), 'utf8')) as T }));
}

async function replaceExercises(
  prisma: PrismaClient,
  where: Prisma.ExerciseWhereInput,
  keep: string[],
): Promise<void> {
  // Content authors delete exercises too. Anything no longer in the file goes,
  // and Prisma cascades the attempts with it.
  await prisma.exercise.deleteMany({ where: { ...where, id: { notIn: keep } } });
}

export async function seedGrammar(prisma: PrismaClient, contentDir: string): Promise<number> {
  const files = readFiles<{ cefr: CefrLevel; lessons: LessonFile[] }>(contentDir, 'grammar');
  if (files.length === 0) {
    console.log('  grammar: chưa có content/grammar, bỏ qua');
    return 0;
  }

  let lessons = 0;
  let exercises = 0;

  for (const { doc } of files) {
    for (const lesson of doc.lessons) {
      const row = await prisma.lesson.upsert({
        where: { slug: lesson.slug },
        update: {
          skill: 'GRAMMAR',
          cefr: doc.cefr,
          title: lesson.title,
          titleVi: lesson.titleVi,
          summary: lesson.summary,
          estimatedMinutes: lesson.estimatedMinutes,
          order: lesson.order,
          prerequisiteIds: lesson.prerequisites ?? [],
          xpReward: lesson.xpReward,
          isPublished: true,
        },
        create: {
          slug: lesson.slug,
          skill: 'GRAMMAR',
          cefr: doc.cefr,
          title: lesson.title,
          titleVi: lesson.titleVi,
          summary: lesson.summary,
          estimatedMinutes: lesson.estimatedMinutes,
          order: lesson.order,
          prerequisiteIds: lesson.prerequisites ?? [],
          xpReward: lesson.xpReward,
          isPublished: true,
        },
      });
      lessons += 1;

      // Sections have no learner-owned rows hanging off them, so a clean
      // replace keeps the order honest when an author reshuffles the lesson.
      await prisma.lessonSection.deleteMany({ where: { lessonId: row.id } });
      await prisma.lessonSection.createMany({
        data: lesson.sections.map((section, index) => ({
          lessonId: row.id,
          order: index + 1,
          kind: section.kind,
          title: section.title,
          bodyMdx: section.body,
        })),
      });

      const ids: string[] = [];
      for (const [index, entry] of lesson.exercises.entries()) {
        const id = `gr_${lesson.slug}_${index + 1}`;
        const { body, answer } = buildExercise(id, entry, index + 1);
        const data = {
          lessonId: row.id,
          type: entry.type,
          cefr: doc.cefr,
          skill: 'GRAMMAR' as const,
          prompt: entry.prompt,
          promptVi: entry.promptVi ?? null,
          body,
          answer,
          explanationVi: entry.explanationVi,
          order: index + 1,
          tags: [lesson.slug],
        };
        await prisma.exercise.upsert({ where: { id }, update: data, create: { id, ...data } });
        ids.push(id);
        exercises += 1;
      }
      await replaceExercises(prisma, { lessonId: row.id }, ids);
    }
  }

  console.log(`  grammar: ${lessons} bài học, ${exercises} bài tập`);
  return lessons;
}

/**
 * Finds where a glossary lemma actually appears in the passage. Inflection is
 * allowed — "pollute" matches "polluted" — because the reader highlights the
 * surface form the author wrote, not the dictionary form.
 */
function isWordChar(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-';
}

/**
 * The endings a lemma may pick up and still be the same word.
 *
 * Anything else is a different word that merely starts the same way.
 */
const INFLECTIONS = new Set([
  '', 's', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly', 'ies', 'ied', 'ier', 'iest',
  'en', 'n',
]);

/** Tách một mục chú giải thành từ cần tra và nghĩa viết sẵn (nếu có). */
function readGlossaryEntry(entry: GlossaryEntry): { lemma: string; definitionVi: string } {
  if (typeof entry === 'string') return { lemma: entry, definitionVi: '' };
  return {
    lemma: entry.term ?? entry.word ?? '',
    // Người soạn dùng lẫn ba tên trường; nhận hết thay vì bắt họ sửa lại.
    definitionVi: entry.definitionVi ?? entry.meaningVi ?? entry.definition ?? '',
  };
}

function findSurface(body: string, lemma: string): { start: number; end: number } | null {
  const stems = [lemma];
  if (lemma.endsWith('e')) stems.push(lemma.slice(0, -1));
  if (lemma.endsWith('y')) stems.push(`${lemma.slice(0, -1)}i`);

  const haystack = body.toLowerCase();
  for (const stem of stems) {
    const needle = stem.toLowerCase();
    for (let from = 0; ; ) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      // Only a match on a word boundary counts, so "port" does not light up
      // inside "important".
      const before = at === 0 ? ' ' : (haystack[at - 1] ?? ' ');
      if (!isWordChar(before)) {
        let last = at + needle.length;
        while (last < haystack.length && isWordChar(haystack[last] ?? ' ')) last += 1;
        const suffix = haystack.slice(at + needle.length, last);
        // Only a real inflectional ending counts. Swallowing any word
        // characters let the stem "prob" (from "probe") match "problems",
        // which put the wrong definition behind a tapped word.
        if (INFLECTIONS.has(suffix)) return { start: at, end: last };
      }
      from = at + 1;
    }
  }
  return null;
}

export async function seedReading(
  prisma: PrismaClient,
  contentDir: string,
  topicIds: Map<string, string>,
): Promise<number> {
  const files = readFiles<{ cefr: CefrLevel; passages: PassageFile[] }>(contentDir, 'reading');
  if (files.length === 0) {
    console.log('  reading: chưa có content/reading, bỏ qua');
    return 0;
  }

  let passages = 0;
  let questions = 0;
  let glossed = 0;

  for (const { doc } of files) {
    for (const passage of doc.passages) {
      const glossary: Prisma.InputJsonValue[] = [];
      for (const entry of passage.glossary ?? []) {
        const { lemma, definitionVi: authored } = readGlossaryEntry(entry);
        if (!lemma) {
          console.warn(`  reading: mục chú giải thiếu từ trong ${passage.slug}`);
          continue;
        }
        const position = findSurface(passage.body, lemma);
        if (!position) {
          console.warn(`  reading: "${lemma}" không xuất hiện trong ${passage.slug}`);
          continue;
        }
        // Word is unique on slug, not lemma, so this is a findFirst.
        const word = await prisma.word.findFirst({
          where: { lemma },
          include: { senses: { orderBy: { order: 'asc' }, take: 1 } },
        });
        glossary.push({
          wordId: word?.id ?? null,
          lemma,
          surface: passage.body.slice(position.start, position.end),
          offsetStart: position.start,
          offsetEnd: position.end,
          definitionVi: word?.senses[0]?.definitionVi || authored,
          pos: word?.senses[0]?.pos ?? null,
          ipa: word?.ipaUs ?? null,
        });
        glossed += 1;
      }

      const data = {
        title: passage.title,
        titleVi: passage.titleVi,
        cefr: doc.cefr,
        bodyMdx: passage.body,
        wordCount: countWords(passage.body),
        estimatedMinutes: passage.estimatedMinutes,
        topicId: passage.topic ? (topicIds.get(passage.topic) ?? null) : null,
        source: passage.source ?? null,
        glossary,
        isPublished: true,
      };
      const row = await prisma.readingPassage.upsert({
        where: { slug: passage.slug },
        update: data,
        create: { slug: passage.slug, ...data },
      });
      passages += 1;

      const ids: string[] = [];
      for (const [index, entry] of passage.questions.entries()) {
        const id = `rd_${passage.slug}_${index + 1}`;
        const { body, answer } = buildExercise(id, entry, index + 1);
        const exercise = {
          passageId: row.id,
          type: entry.type,
          cefr: doc.cefr,
          skill: 'READING' as const,
          prompt: entry.prompt,
          promptVi: entry.promptVi ?? null,
          body,
          answer,
          explanationVi: entry.explanationVi,
          order: index + 1,
          tags: [passage.slug],
        };
        await prisma.exercise.upsert({
          where: { id },
          update: exercise,
          create: { id, ...exercise },
        });
        ids.push(id);
        questions += 1;
      }
      await replaceExercises(prisma, { passageId: row.id }, ids);
    }
  }

  console.log(`  reading: ${passages} bài đọc, ${questions} câu hỏi, ${glossed} từ tra nhanh`);
  return passages;
}

/**
 * D-033 — no TTS provider is configured, so there is no recorded audio to take
 * real timings from. The player speaks each segment with the browser's speech
 * synthesis, and these estimated timings drive the transcript highlighting and
 * the progress bar.
 *
 * 400 ms per word is roughly 150 words a minute, an unhurried speaking pace;
 * a short pause is added between segments so speakers do not run together.
 */
const MS_PER_WORD = 400;
const SEGMENT_GAP_MS = 350;
const MIN_SEGMENT_MS = 1200;

export function estimateSegments(
  segments: { speaker?: string; text: string; vi?: string }[],
): { startMs: number; endMs: number; words: { w: string; startMs: number; endMs: number }[] }[] {
  let cursor = 0;
  return segments.map((segment) => {
    const tokens = segment.text.split(/\s+/).filter(Boolean);
    const duration = Math.max(MIN_SEGMENT_MS, tokens.length * MS_PER_WORD);
    const startMs = cursor;
    // Longer words take longer to say, so the share of the segment each word
    // gets is weighted by its length rather than split evenly.
    const totalChars = tokens.reduce((sum, token) => sum + token.length, 0) || 1;
    let wordCursor = startMs;
    const endMs = startMs + duration;
    const words = tokens.map((token, index) => {
      const share = Math.round((token.length / totalChars) * duration);
      const wordStart = wordCursor;
      // Rounding each share accumulates a few milliseconds of drift, so the
      // last word is pinned to the segment end rather than allowed past it.
      wordCursor = index === tokens.length - 1 ? endMs : Math.min(endMs, wordCursor + share);
      return { w: token, startMs: wordStart, endMs: wordCursor };
    });
    cursor = endMs + SEGMENT_GAP_MS;
    return { startMs, endMs, words };
  });
}

export async function seedListening(
  prisma: PrismaClient,
  contentDir: string,
  topicIds: Map<string, string>,
): Promise<number> {
  const files = readFiles<{ cefr: CefrLevel; tracks: TrackFile[] }>(contentDir, 'listening');
  if (files.length === 0) {
    console.log('  listening: chưa có content/listening, bỏ qua');
    return 0;
  }

  let tracks = 0;
  let questions = 0;
  let dictations = 0;

  for (const { doc } of files) {
    for (const track of doc.tracks) {
      const timings = estimateSegments(track.segments);
      const last = timings.at(-1);
      const data = {
        title: track.title,
        titleVi: track.titleVi,
        cefr: doc.cefr,
        // Empty until a provider is configured; the client falls back to speech
        // synthesis and says so in the player (D-033).
        audioUrl: '',
        durationSec: Math.ceil((last?.endMs ?? 0) / 1000),
        accent: track.accent,
        format: track.format,
        speakerCount: track.speakerCount,
        topicId: track.topic ? (topicIds.get(track.topic) ?? null) : null,
        isPublished: true,
      };
      const row = await prisma.listeningTrack.upsert({
        where: { slug: track.slug },
        update: data,
        create: { slug: track.slug, ...data },
      });
      tracks += 1;

      await prisma.transcriptSegment.deleteMany({ where: { trackId: row.id } });
      await prisma.transcriptSegment.createMany({
        data: track.segments.map((segment, index) => ({
          trackId: row.id,
          order: index + 1,
          startMs: timings[index]?.startMs ?? 0,
          endMs: timings[index]?.endMs ?? 0,
          speaker: segment.speaker ?? null,
          text: segment.text,
          words: timings[index]?.words ?? [],
          translationVi: segment.vi ?? null,
        })),
      });

      const ids: string[] = [];
      for (const [index, entry] of track.questions.entries()) {
        const id = `ls_${track.slug}_q${index + 1}`;
        const { body, answer } = buildExercise(id, entry, index + 1);
        const exercise = {
          trackId: row.id,
          type: entry.type,
          cefr: doc.cefr,
          skill: 'LISTENING' as const,
          prompt: entry.prompt,
          promptVi: entry.promptVi ?? null,
          body,
          answer,
          explanationVi: entry.explanationVi,
          order: index + 1,
          tags: [track.slug, 'comprehension'],
        };
        await prisma.exercise.upsert({
          where: { id },
          update: exercise,
          create: { id, ...exercise },
        });
        ids.push(id);
        questions += 1;
      }

      // Dictation lines are ordered after the comprehension questions so the
      // two groups keep a stable order when they are served together.
      for (const [index, segmentOrder] of (track.dictation ?? []).entries()) {
        const segment = track.segments[segmentOrder - 1];
        if (!segment) {
          console.warn(`  listening: ${track.slug} không có đoạn số ${segmentOrder}`);
          continue;
        }
        const id = `ls_${track.slug}_d${index + 1}`;
        const { body, answer } = buildExercise(
          id,
          {
            type: 'DICTATION',
            prompt: 'Nghe và chép lại chính xác câu bạn nghe được.',
            explanationVi: `Câu gốc trong bài: "${segment.text}"`,
            answer: segment.text,
          },
          segmentOrder,
        );
        const exercise = {
          trackId: row.id,
          type: 'DICTATION' as const,
          cefr: doc.cefr,
          skill: 'LISTENING' as const,
          prompt: 'Nghe và chép lại chính xác câu bạn nghe được.',
          promptVi: null,
          body,
          answer,
          explanationVi: `Câu gốc trong bài: "${segment.text}"`,
          order: 100 + index + 1,
          tags: [track.slug, 'dictation'],
        };
        await prisma.exercise.upsert({
          where: { id },
          update: exercise,
          create: { id, ...exercise },
        });
        ids.push(id);
        dictations += 1;
      }

      await replaceExercises(prisma, { trackId: row.id }, ids);
    }
  }

  console.log(`  listening: ${tracks} bài nghe, ${questions} câu hỏi, ${dictations} câu chép chính tả`);
  return tracks;
}
