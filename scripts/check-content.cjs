/**
 * Parses every content YAML and reports the counts, so a broken quote is caught
 * before `pnpm db:seed` runs half way and leaves the database inconsistent.
 *
 * It also refuses duplicate vocabulary lemmas. That check exists because it was
 * needed: an expansion pass added six words that already existed in the same
 * file, and because the seeder upserts by slug, the database simply came out
 * smaller than the files. Nothing failed and nothing warned — the count was
 * just quietly wrong.
 */
const { parse } = require('../apps/api/node_modules/yaml');
const fs = require('node:fs');
const path = require('node:path');

const roots = ['vocabulary', 'grammar', 'reading', 'listening', 'tests', 'writing', 'speaking', 'sentence'];
let failed = 0;
let files = 0;

/** lemma -> the topic files it appears in, for the cross-file report below. */
const lemmaHome = new Map();

for (const root of roots) {
  const dir = path.resolve(__dirname, '..', 'content', root);
  if (!fs.existsSync(dir)) continue;

  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const file = path.join(dir, name);
    files += 1;
    try {
      const doc = parse(fs.readFileSync(file, 'utf8'));
      const items =
        doc.lessons ??
        doc.passages ??
        doc.tracks ??
        doc.tests ??
        doc.prompts ??
        doc.drills ??
        doc.scenarios ??
        doc.sets ??
        doc.words ??
        [];
      const children = items.reduce(
        (sum, item) =>
          sum +
          (item.exercises?.length ?? 0) +
          (item.questions?.length ?? 0) +
          (item.senses?.length ?? 0) +
          (item.dictation?.length ?? 0) +
          (item.items?.length ?? 0),
        0,
      );

      if (root === 'vocabulary') {
        const seen = new Set();
        const duplicates = [];
        for (const word of items) {
          const key = String(word.lemma).toLowerCase();
          if (seen.has(key)) duplicates.push(word.lemma);
          seen.add(key);
          lemmaHome.set(key, [...(lemmaHome.get(key) ?? []), name.replace('.yaml', '')]);
        }
        if (duplicates.length > 0) {
          failed += 1;
          console.log(
            `FAIL ${root}/${name}\n     lemma trùng trong cùng tệp: ${duplicates.join(', ')}`,
          );
          continue;
        }
      }

      console.log(`OK   ${root}/${name}  items=${items.length} children=${children}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${root}/${name}\n     ${String(error.message).split('\n')[0]}`);
    }
  }
}

// Shared words keep all their topic memberships. Count each lemma once in the
// dictionary while allowing it to appear in multiple learning collections.
const shared = [...lemmaHome].filter(([, homes]) => new Set(homes).size > 1);
if (shared.length > 0) {
  console.log(`\n${shared.length} từ dùng chung giữa các chủ đề (giữ đủ liên kết khi seed).`);
}

console.log(`\n${files} tệp, ${failed} lỗi. Từ vựng: ${lemmaHome.size} từ duy nhất.`);
process.exit(failed === 0 ? 0 : 1);
