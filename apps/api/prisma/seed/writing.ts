import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { CefrLevel, PrismaClient } from '@prisma/client';

interface PromptFile {
  slug: string;
  kind: string;
  cefr: CefrLevel;
  title: string;
  instructionsVi: string;
  instructionsEn: string;
  minWords: number;
  maxWords: number;
  timeLimitMin?: number | null;
  outlineVi?: string | null;
  sampleAnswer?: string | null;
  rubricKeys?: string[];
}

/**
 * Seeds `content/writing/*.yaml`.
 *
 * Prompts are never deleted on re-seed: a `WritingSubmission` points at one,
 * and removing the prompt would orphan work the learner did. An author who
 * retires a prompt should let it fall out of the listing instead, which is what
 * `isRetired` would be for if it becomes necessary.
 */
export async function seedWritingPrompts(
  prisma: PrismaClient,
  contentDir: string,
): Promise<number> {
  const dir = join(contentDir, 'writing');
  if (!existsSync(dir)) {
    console.log('  writing: chưa có content/writing, bỏ qua');
    return 0;
  }

  let total = 0;

  for (const name of readdirSync(dir).filter((file) => file.endsWith('.yaml')).sort()) {
    const doc = parse(readFileSync(join(dir, name), 'utf8')) as { prompts: PromptFile[] };

    for (const prompt of doc.prompts) {
      if (prompt.minWords >= prompt.maxWords) {
        throw new Error(`writing/${prompt.slug}: minWords phải nhỏ hơn maxWords`);
      }

      const data = {
        kind: prompt.kind,
        cefr: prompt.cefr,
        title: prompt.title,
        instructionsVi: prompt.instructionsVi.trim(),
        instructionsEn: prompt.instructionsEn.trim(),
        minWords: prompt.minWords,
        maxWords: prompt.maxWords,
        rubricKeys: prompt.rubricKeys ?? ['task', 'organization', 'vocabulary', 'grammar'],
        outlineVi: prompt.outlineVi?.trim() ?? null,
        sampleAnswer: prompt.sampleAnswer?.trim() ?? null,
        timeLimitMin: prompt.timeLimitMin ?? null,
      };

      await prisma.writingPrompt.upsert({
        where: { slug: prompt.slug },
        update: data,
        create: { slug: prompt.slug, ...data },
      });
      total += 1;
    }
  }

  console.log(`  writing: ${total} đề bài viết`);
  return total;
}
