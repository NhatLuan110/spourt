import { PrismaClient } from '@prisma/client';
import type { CefrLevel, PartOfSpeech } from '@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { TOPICS, slugify } from '@sprout/shared';
import { SUFFIX_RULES } from './suffix-rules';
import { ACHIEVEMENTS } from './achievements';
import { seedGrammar, seedListening, seedReading } from './lessons';
import { seedTests } from './tests';
import { seedWritingPrompts } from './writing';
import { seedSpeaking } from './speaking';
import { seedSentenceSets } from './sentence';

const prisma = new PrismaClient();
const CONTENT_DIR = resolve(process.cwd(), '../../content');

interface WordFileSense {
  pos: PartOfSpeech;
  definitionEn: string;
  definitionVi: string;
  register?: string;
  examples: { en: string; vi: string; highlight?: [number, number] }[];
  synonyms?: string[];
  antonyms?: string[];
}

interface WordFileEntry {
  lemma: string;
  cefr: CefrLevel;
  frequencyRank?: number;
  ipaUs?: string;
  ipaUk?: string;
  syllables?: string;
  stressPattern?: string;
  subtopics?: string[];
  senses: WordFileSense[];
}

interface VocabularyFile {
  topic: string;
  words: WordFileEntry[];
}

/**
 * §12.1 requires every example to mark where the target word sits so the UI can
 * bold it. Computing that here keeps the content files readable and stops the
 * offsets drifting when someone edits a sentence.
 */
function highlightRange(sentence: string, lemma: string): [number, number] {
  // Inflection drops the silent -e (browse -> browsing) and turns -y into -i
  // (study -> studied), so the stems are tried in order of specificity.
  const stems = [lemma];
  if (lemma.endsWith('e')) stems.push(lemma.slice(0, -1));
  if (lemma.endsWith('y')) stems.push(`${lemma.slice(0, -1)}i`);

  for (const stem of stems) {
    const pattern = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i');
    const match = pattern.exec(sentence);
    if (match) return [match.index, match.index + match[0].length];
  }

  console.warn(`  highlight: không tìm thấy "${lemma}" trong "${sentence}" — thêm trường highlight`);
  return [0, 0];
}

async function seedTopics(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const topic of TOPICS) {
    const parent = await prisma.topic.upsert({
      where: { slug: topic.slug },
      update: {
        nameEn: topic.nameEn,
        nameVi: topic.nameVi,
        emoji: topic.emoji,
        colorToken: topic.colorToken,
        description: topic.description,
        order: topic.order,
      },
      create: {
        slug: topic.slug,
        nameEn: topic.nameEn,
        nameVi: topic.nameVi,
        emoji: topic.emoji,
        colorToken: topic.colorToken,
        description: topic.description,
        order: topic.order,
      },
    });
    ids.set(topic.slug, parent.id);

    for (const [index, subtopic] of topic.subtopics.entries()) {
      const child = await prisma.topic.upsert({
        where: { slug: subtopic.slug },
        update: { nameEn: subtopic.nameEn, nameVi: subtopic.nameVi, parentId: parent.id },
        create: {
          slug: subtopic.slug,
          nameEn: subtopic.nameEn,
          nameVi: subtopic.nameVi,
          emoji: topic.emoji,
          colorToken: topic.colorToken,
          description: `${topic.nameVi} · ${subtopic.nameVi}`,
          order: index + 1,
          parentId: parent.id,
        },
      });
      ids.set(subtopic.slug, child.id);
    }
  }

  console.log(`  topics: ${TOPICS.length} chủ đề, ${ids.size - TOPICS.length} chủ đề con`);
  return ids;
}

async function seedWords(topicIds: Map<string, string>): Promise<number> {
  const dir = join(CONTENT_DIR, 'vocabulary');
  if (!existsSync(dir)) {
    console.log('  words: chưa có content/vocabulary, bỏ qua');
    return 0;
  }

  // Preserve the previous seeder's last-topic definition for shared words;
  // the communication collection reuses it without replacing other memberships.
  const files = readdirSync(dir).filter((name) => name.endsWith('.yaml')).sort(
    (a, b) => Number(a === 'everyday-communication.yaml') - Number(b === 'everyday-communication.yaml') || b.localeCompare(a),
  );
  const sources = files.map((file) => ({
    file,
    parsed: parse(readFileSync(join(dir, file), 'utf8')) as VocabularyFile,
  }));
  const memberships = new Map<string, Set<string>>();
  for (const { parsed } of sources) {
    if (!topicIds.has(parsed.topic)) throw new Error(`Unknown vocabulary topic: ${parsed.topic}`);
    for (const entry of parsed.words) {
      const slug = slugify(entry.lemma);
      const ids = memberships.get(slug) ?? new Set<string>();
      for (const topicSlug of [parsed.topic, ...(entry.subtopics ?? [])]) {
        const id = topicIds.get(topicSlug);
        if (!id) throw new Error(`Unknown vocabulary subtopic: ${topicSlug}`);
        ids.add(id);
      }
      memberships.set(slug, ids);
    }
  }
  const seeded = new Set<string>();
  let total = 0;
  // Sense ids by "lemma:pos", so synonym links can be resolved after every
  // word exists.
  const senseIndex = new Map<string, string>();
  const pendingRelations: { from: string; toLemma: string; kind: string }[] = [];

  for (const { file, parsed } of sources) {
    const topicId = topicIds.get(parsed.topic);
    if (!topicId) {
      console.warn(`  words: bỏ qua ${file}, không tìm thấy chủ đề "${parsed.topic}"`);
      continue;
    }

    for (const entry of parsed.words) {
      const slug = slugify(entry.lemma);
      if (seeded.has(slug)) continue;
      const connectTopics = [...(memberships.get(slug) ?? [])].map((id) => ({ id }));
      seeded.add(slug);

      const word = await prisma.word.upsert({
        where: { slug },
        update: {
          cefr: entry.cefr,
          frequencyRank: entry.frequencyRank,
          ipaUs: entry.ipaUs,
          ipaUk: entry.ipaUk,
          syllables: entry.syllables,
          stressPattern: entry.stressPattern,
          topics: { set: connectTopics },
        },
        create: {
          lemma: entry.lemma,
          slug,
          cefr: entry.cefr,
          frequencyRank: entry.frequencyRank,
          ipaUs: entry.ipaUs,
          ipaUk: entry.ipaUk,
          syllables: entry.syllables,
          stressPattern: entry.stressPattern,
          topics: { connect: connectTopics },
        },
      });

      // Senses are rewritten wholesale: content files are the source of truth.
      await prisma.wordSense.deleteMany({ where: { wordId: word.id } });

      for (const [order, sense] of entry.senses.entries()) {
        const created = await prisma.wordSense.create({
          data: {
            wordId: word.id,
            pos: sense.pos,
            definitionEn: sense.definitionEn,
            definitionVi: sense.definitionVi,
            register: sense.register,
            order,
            examples: {
              create: sense.examples.map((example) => {
                const [start, end] = example.highlight ?? highlightRange(example.en, entry.lemma);
                return {
                  textEn: example.en,
                  textVi: example.vi,
                  highlightStart: start,
                  highlightEnd: end,
                };
              }),
            },
          },
        });

        senseIndex.set(`${entry.lemma.toLowerCase()}:${sense.pos}`, created.id);
        for (const synonym of sense.synonyms ?? []) {
          pendingRelations.push({ from: created.id, toLemma: synonym, kind: 'synonym' });
        }
        for (const antonym of sense.antonyms ?? []) {
          pendingRelations.push({ from: created.id, toLemma: antonym, kind: 'antonym' });
        }
      }

      total += 1;
    }
  }

  let linked = 0;
  for (const relation of pendingRelations) {
    // Match the first sense of the target word, whatever its part of speech.
    const targetKey = [...senseIndex.keys()].find(
      (key) => key.split(':')[0] === relation.toLemma.toLowerCase(),
    );
    const toSenseId = targetKey ? senseIndex.get(targetKey) : undefined;
    if (!toSenseId || toSenseId === relation.from) continue;

    await prisma.senseRelation.upsert({
      where: {
        fromSenseId_toSenseId_kind: {
          fromSenseId: relation.from,
          toSenseId,
          kind: relation.kind,
        },
      },
      update: {},
      create: { fromSenseId: relation.from, toSenseId, kind: relation.kind },
    });
    linked += 1;
  }

  console.log(`  words: ${total} từ, ${linked} liên kết đồng/trái nghĩa`);
  return total;
}

interface FamilyFileMember {
  lemma: string;
  pos: PartOfSpeech;
  suffix?: string;
  note?: string;
}

interface FamilyFile {
  families: { rootSlug: string; glossVi: string; members: FamilyFileMember[] }[];
}

/**
 * §7.4 — word families. Members are matched to real Word rows by slug, so a
 * family that names a word the vocabulary files do not contain is reported
 * rather than silently creating an empty family.
 */
async function seedWordFamilies(): Promise<void> {
  const file = join(CONTENT_DIR, 'word-families.yaml');
  if (!existsSync(file)) {
    console.warn('  families: không tìm thấy content/word-families.yaml');
    return;
  }

  const parsed = parse(readFileSync(file, 'utf8')) as FamilyFile;
  let families = 0;
  let members = 0;

  for (const entry of parsed.families ?? []) {
    const slugs = entry.members.map((member) => slugify(member.lemma));
    const words = await prisma.word.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
    const bySlug = new Map(words.map((word) => [word.slug, word.id]));

    const missing = slugs.filter((slug) => !bySlug.has(slug));
    if (missing.length > 0) {
      console.warn(`  families: ${entry.rootSlug} thiếu từ ${missing.join(', ')}`);
    }
    if (!bySlug.has(entry.rootSlug)) {
      console.warn(`  families: bỏ qua ${entry.rootSlug}, gốc chưa có trong từ điển`);
      continue;
    }

    const family = await prisma.wordFamily.upsert({
      where: { rootSlug: entry.rootSlug },
      update: { glossVi: entry.glossVi },
      create: { rootSlug: entry.rootSlug, glossVi: entry.glossVi },
    });

    for (const member of entry.members) {
      const wordId = bySlug.get(slugify(member.lemma));
      if (!wordId) continue;

      await prisma.wordForm.upsert({
        where: {
          familyId_wordId_pos: { familyId: family.id, wordId, pos: member.pos },
        },
        update: { suffix: member.suffix ?? null, note: member.note ?? null },
        create: {
          familyId: family.id,
          wordId,
          pos: member.pos,
          suffix: member.suffix ?? null,
          note: member.note ?? null,
        },
      });
      members += 1;
    }

    families += 1;
  }

  console.log(`  families: ${families} họ từ, ${members} thành viên`);
}

async function seedSuffixRules(): Promise<void> {
  for (const rule of SUFFIX_RULES) {
    await prisma.suffixRule.upsert({
      where: { suffix: rule.suffix },
      update: rule,
      create: rule,
    });
  }
  console.log(`  suffix rules: ${SUFFIX_RULES.length} quy tắc hậu tố`);
}

async function seedAchievements(): Promise<void> {
  for (const achievement of ACHIEVEMENTS) {
    const { isSecret = false, ...rest } = achievement;
    await prisma.achievement.upsert({
      where: { slug: achievement.slug },
      update: { ...rest, isSecret },
      create: { ...rest, isSecret },
    });
  }
  console.log(`  achievements: ${ACHIEVEMENTS.length} thành tựu`);
}

async function main(): Promise<void> {
  console.log('Seeding Sprout...');
  const topicIds = await seedTopics();
  await seedWords(topicIds);
  await seedWordFamilies();
  await seedSuffixRules();
  await seedAchievements();
  await seedGrammar(prisma, CONTENT_DIR);
  await seedReading(prisma, CONTENT_DIR, topicIds);
  await seedListening(prisma, CONTENT_DIR, topicIds);
  await seedTests(prisma, CONTENT_DIR);
  await seedWritingPrompts(prisma, CONTENT_DIR);
  await seedSpeaking(prisma, CONTENT_DIR);
  await seedSentenceSets(prisma, CONTENT_DIR);
  console.log('Seed xong.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
