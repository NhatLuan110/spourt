import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { CefrLevel, Prisma, PrismaClient } from '@prisma/client';

/**
 * Seeds `content/sentence/*.yaml` — sentence transformation ("viết lại câu").
 *
 * Each item becomes an ordinary `Exercise` of type `REWRITE`, so it is graded,
 * logged and counted by the same machinery as every other exercise. The set it
 * belongs to is carried in `tags`, which is what the practice endpoint filters
 * on: a `Lesson` row would imply prerequisites and progress tracking that a
 * drill set does not have.
 */

interface ItemFile {
  source: string;
  cue: string | null;
  cueType: 'start' | 'keyword' | 'none';
  accepted: string[];
  explanationVi: string;
}

interface SetFile {
  slug: string;
  title: string;
  titleVi: string;
  cefr: CefrLevel;
  explanationVi: string;
  items: ItemFile[];
}

export async function seedSentenceSets(
  prisma: PrismaClient,
  contentDir: string,
): Promise<number> {
  const dir = join(contentDir, 'sentence');
  if (!existsSync(dir)) {
    console.log('  sentence: chưa có content/sentence, bỏ qua');
    return 0;
  }

  let sets = 0;
  let items = 0;

  for (const name of readdirSync(dir).filter((file) => file.endsWith('.yaml')).sort()) {
    const doc = parse(readFileSync(join(dir, name), 'utf8')) as { sets: SetFile[] };

    for (const set of doc.sets) {
      const ids: string[] = [];

      for (const [index, item] of set.items.entries()) {
        if (item.accepted.length === 0) {
          throw new Error(`sentence/${set.slug}#${index + 1}: thiếu câu trả lời đúng`);
        }
        if (item.cueType !== 'none' && !item.cue) {
          throw new Error(`sentence/${set.slug}#${index + 1}: cueType là ${item.cueType} nhưng thiếu cue`);
        }

        const id = `rw_${set.slug}_${index + 1}`;
        const body = {
          mode: 'rewrite',
          source: item.source,
          cue: item.cue,
          cueType: item.cueType,
          setSlug: set.slug,
          setTitleVi: set.titleVi,
        } as unknown as Prisma.InputJsonValue;

        const data = {
          type: 'REWRITE' as const,
          cefr: set.cefr,
          // Sentence transformation is grammar practice: it drills a structure,
          // and the §9.7 observation belongs to the grammar score.
          skill: 'GRAMMAR' as const,
          prompt: item.source,
          promptVi: item.cue
            ? `Viết lại câu, dùng "${item.cue}".`
            : 'Viết lại câu sao cho nghĩa không đổi.',
          body,
          answer: { accepted: item.accepted } as unknown as Prisma.InputJsonValue,
          explanationVi: item.explanationVi,
          difficulty: cefrDifficulty(set.cefr),
          order: index + 1,
          tags: ['sentence', set.slug],
        };

        await prisma.exercise.upsert({ where: { id }, update: data, create: { id, ...data } });
        ids.push(id);
        items += 1;
      }

      // Items dropped from the file are dropped from the database too, so an
      // edited set does not leave orphans that still appear in practice.
      //
      // Scoped by this set's own id prefix, not by tag. A slug can be shared
      // across content types — "passive-voice" is both a grammar lesson and a
      // rewrite set — and a tag-only filter here deleted that lesson's
      // exercises, which is exactly what happened before this was scoped.
      await prisma.exercise.deleteMany({
        where: {
          id: { startsWith: `rw_${set.slug}_`, notIn: ids },
        },
      });
      sets += 1;
    }
  }

  console.log(`  sentence: ${sets} nhóm mẫu, ${items} câu viết lại`);
  return items;
}

function cefrDifficulty(cefr: CefrLevel): number {
  const order: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
  return Number((order[cefr] / 5).toFixed(2));
}
