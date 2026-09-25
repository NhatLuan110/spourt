import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { CefrLevel, Prisma, PrismaClient } from '@prisma/client';
import { VIETNAMESE_ERROR_PATTERNS } from '@sprout/scoring';

interface DrillFile {
  slug: string;
  text: string;
  cefr: CefrLevel;
  focus: string;
  ipa?: string | null;
  translationVi: string;
  minimalPair?: string | null;
  tipVi: string;
}

interface ScenarioFile {
  slug: string;
  title: string;
  titleVi: string;
  cefr: CefrLevel;
  category: string;
  maxTurns: number;
  aiPersona: string;
  objectives: string[];
  usefulPhrases: { en: string; vi: string; when: string }[];
}

/**
 * Seeds `content/speaking/*.yaml`.
 *
 * A drill's `focus` must match a `drillFocus` in the §7.6.3 error table, or the
 * drill recommender will never surface it for the learner whose weakness it was
 * written for. That is checked here rather than discovered later as an empty
 * recommendation list.
 */
export async function seedSpeaking(prisma: PrismaClient, contentDir: string): Promise<number> {
  const dir = join(contentDir, 'speaking');
  if (!existsSync(dir)) {
    console.log('  speaking: chưa có content/speaking, bỏ qua');
    return 0;
  }

  const knownFocuses = new Set(VIETNAMESE_ERROR_PATTERNS.map((pattern) => pattern.drillFocus));
  let drills = 0;
  let scenarios = 0;

  const drillPath = join(dir, 'drills.yaml');
  if (existsSync(drillPath)) {
    const doc = parse(readFileSync(drillPath, 'utf8')) as { drills: DrillFile[] };

    for (const drill of doc.drills) {
      if (!knownFocuses.has(drill.focus)) {
        throw new Error(
          `speaking/${drill.slug}: focus "${drill.focus}" không khớp drillFocus nào trong §7.6.3 ` +
            `(hợp lệ: ${[...knownFocuses].join(', ')})`,
        );
      }

      const data = {
        text: drill.text,
        cefr: drill.cefr,
        focus: drill.focus,
        ipa: drill.ipa ?? null,
        translationVi: drill.translationVi,
        // Filled in when a TTS provider generates the model reading (D-045).
        audioUrl: null,
        minimalPair: drill.minimalPair ?? null,
        tipVi: drill.tipVi.trim(),
      };
      await prisma.speakingDrill.upsert({
        where: { slug: drill.slug },
        update: data,
        create: { slug: drill.slug, ...data },
      });
      drills += 1;
    }
  }

  const scenarioPath = join(dir, 'scenarios.yaml');
  if (existsSync(scenarioPath)) {
    const doc = parse(readFileSync(scenarioPath, 'utf8')) as { scenarios: ScenarioFile[] };

    for (const scenario of doc.scenarios) {
      const data = {
        title: scenario.title,
        titleVi: scenario.titleVi,
        cefr: scenario.cefr,
        category: scenario.category,
        coverImageUrl: null,
        aiPersona: scenario.aiPersona.trim(),
        objectives: scenario.objectives,
        usefulPhrases: scenario.usefulPhrases as unknown as Prisma.InputJsonValue,
        maxTurns: scenario.maxTurns,
      };
      await prisma.speakingScenario.upsert({
        where: { slug: scenario.slug },
        update: data,
        create: { slug: scenario.slug, ...data },
      });
      scenarios += 1;
    }
  }

  const covered = new Set(
    (await prisma.speakingDrill.findMany({ select: { focus: true } })).map((row) => row.focus),
  );
  const uncovered = [...knownFocuses].filter((focus) => !covered.has(focus));
  if (uncovered.length > 0) {
    console.warn(`  speaking: chưa có bài luyện cho nhóm lỗi: ${uncovered.join(', ')}`);
  }

  console.log(`  speaking: ${drills} bài luyện, ${scenarios} tình huống`);
  return drills + scenarios;
}
