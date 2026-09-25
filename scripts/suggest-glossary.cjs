/**
 * Lists vocabulary lemmas that actually occur in each reading passage.
 *
 * A glossary entry only works if the word is in the text — the seeder needs a
 * character offset to underline it. Choosing the entries by hand is how they
 * came to name fourteen words that were not there, so the list is derived.
 *
 * The matching rule below mirrors `findSurface` in the seeder exactly. It has
 * to: a looser rule here would suggest words the seeder then refuses, and a
 * looser rule there once matched the stem "prob" against "problems".
 *
 * Chạy: node scripts/suggest-glossary.cjs
 */
const { parse } = require('../apps/api/node_modules/yaml');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/** The endings a lemma may pick up and still be the same word. */
const INFLECTIONS = new Set([
  '', 's', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly', 'ies', 'ied', 'ier', 'iest', 'en', 'n',
]);

function isWordChar(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-';
}

function appearsIn(body, lemma) {
  const stems = [lemma];
  if (lemma.endsWith('e')) stems.push(lemma.slice(0, -1));
  if (lemma.endsWith('y')) stems.push(`${lemma.slice(0, -1)}i`);

  const haystack = body.toLowerCase();
  for (const stem of stems) {
    const needle = stem.toLowerCase();
    for (let from = 0; ; ) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      const before = at === 0 ? ' ' : (haystack[at - 1] ?? ' ');
      if (!isWordChar(before)) {
        let last = at + needle.length;
        while (last < haystack.length && isWordChar(haystack[last] ?? ' ')) last += 1;
        if (INFLECTIONS.has(haystack.slice(at + needle.length, last))) return true;
      }
      from = at + 1;
    }
  }
  return false;
}

const lemmas = [];
for (const file of fs.readdirSync(path.join(root, 'content/vocabulary'))) {
  if (!file.endsWith('.yaml')) continue;
  const doc = parse(fs.readFileSync(path.join(root, 'content/vocabulary', file), 'utf8'));
  for (const word of doc.words ?? []) lemmas.push(word.lemma);
}

for (const file of fs.readdirSync(path.join(root, 'content/reading'))) {
  if (!file.endsWith('.yaml')) continue;
  const doc = parse(fs.readFileSync(path.join(root, 'content/reading', file), 'utf8'));

  for (const passage of doc.passages ?? []) {
    const present = lemmas.filter((lemma) => appearsIn(passage.body, lemma));
    const current = passage.glossary ?? [];
    const missing = current.filter((lemma) => !appearsIn(passage.body, lemma));

    console.log(passage.slug);
    console.log(
      `   đang dùng  : [${current.join(', ')}]` +
        (missing.length ? `  ← không có trong bài: ${missing.join(', ')}` : ''),
    );
    console.log(
      `   có thể dùng: ${present.join(', ') || '(không từ nào trong bộ từ vựng xuất hiện)'}`,
    );
    console.log('');
  }
}
