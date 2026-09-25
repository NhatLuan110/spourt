import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { CefrLevel, PrismaClient, Skill } from '@prisma/client';
import { buildExercise, type ExerciseFile } from './lessons';

/**
 * Seeds `content/tests/*.yaml`.
 *
 * A test question is an ordinary `Exercise` row with no lesson, track or
 * passage attached, so it is graded by exactly the same code as everything
 * else. `TestSection.questionIds` is what ties a question to a section.
 */

interface TestQuestionFile extends ExerciseFile {
  skill: Skill;
  cefr: CefrLevel;
}

interface TestFile {
  slug: string;
  kind: string;
  skill?: Skill;
  cefr?: CefrLevel;
  title: string;
  description: string;
  durationMin: number;
  passScore: number;
  isAdaptive?: boolean;
  sections: { skill: Skill; title: string; order: number; timeLimitMin?: number }[];
  questions: TestQuestionFile[];
}

export async function seedTests(prisma: PrismaClient, contentDir: string): Promise<number> {
  const dir = join(contentDir, 'tests');
  if (!existsSync(dir)) {
    console.log('  tests: chưa có content/tests, bỏ qua');
    return 0;
  }

  let total = 0;
  let questions = 0;

  for (const name of readdirSync(dir).filter((file) => file.endsWith('.yaml')).sort()) {
    const doc = parse(readFileSync(join(dir, name), 'utf8')) as { tests: TestFile[] };

    for (const test of doc.tests) {
      const data = {
        kind: test.kind,
        skill: test.skill ?? null,
        cefr: test.cefr ?? null,
        title: test.title,
        description: test.description,
        durationMin: test.durationMin,
        passScore: test.passScore,
        isAdaptive: test.isAdaptive ?? false,
      };
      const row = await prisma.test.upsert({
        where: { slug: test.slug },
        update: data,
        create: { slug: test.slug, ...data },
      });
      total += 1;

      const bySkill = new Map<Skill, string[]>();
      const ids: string[] = [];

      for (const [index, entry] of test.questions.entries()) {
        const id = `tq_${test.slug}_${index + 1}`;
        const { body, answer } = buildExercise(id, entry, index + 1);
        const exercise = {
          type: entry.type,
          cefr: entry.cefr,
          skill: entry.skill,
          prompt: entry.prompt,
          promptVi: entry.promptVi ?? null,
          body,
          answer,
          explanationVi: entry.explanationVi,
          // Difficulty is read off the level so the adaptive walk and the
          // recommendation engine agree about what "hard" means.
          difficulty: cefrDifficulty(entry.cefr),
          order: index + 1,
          tags: [test.slug, 'test'],
        };
        await prisma.exercise.upsert({
          where: { id },
          update: exercise,
          create: { id, ...exercise },
        });
        ids.push(id);
        questions += 1;

        const bucket = bySkill.get(entry.skill) ?? [];
        bucket.push(id);
        bySkill.set(entry.skill, bucket);
      }

      // Sections carry no learner state, so replacing them keeps the order and
      // the question lists honest when an author edits the file.
      await prisma.testSection.deleteMany({ where: { testId: row.id } });
      for (const section of test.sections) {
        await prisma.testSection.create({
          data: {
            testId: row.id,
            skill: section.skill,
            title: section.title,
            order: section.order,
            timeLimitMin: section.timeLimitMin ?? null,
            questionIds: bySkill.get(section.skill) ?? [],
          },
        });
      }

      // Questions removed from the file are removed from the database too.
      //
      // Scoped by this test's own id prefix rather than by tag. A slug can be
      // shared across content types — "passive-voice" is both a grammar lesson
      // and a rewrite set — and a tag-only filter here would delete rows this
      // seeder does not own.
      await prisma.exercise.deleteMany({
        where: {
          id: { startsWith: `tq_${test.slug}_`, notIn: ids },
        },
      });
    }
  }

  console.log(`  tests: ${total} bài kiểm tra, ${questions} câu hỏi`);
  return total;
}

/** 0..1, so an A1 question is easy and a C2 question is hard. */
function cefrDifficulty(cefr: CefrLevel): number {
  const order: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
  return Number((order[cefr] / 5).toFixed(2));
}
