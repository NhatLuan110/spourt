/**
 * Removes duplicate lemmas from a vocabulary file, keeping the first entry.
 *
 * Written as a script rather than done by hand because the entries are seven
 * lines apart and an eyeballed deletion in YAML is how you lose the word after
 * the one you meant to remove.
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..', 'content', 'vocabulary');
let removedTotal = 0;

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
  const file = path.join(dir, name);
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  // Entries start at "  - lemma: x" and run to just before the next one.
  const starts = [];
  lines.forEach((line, index) => {
    if (/^ {2}- lemma:/.test(line)) starts.push(index);
  });

  const seen = new Set();
  const dropRanges = [];
  const removed = [];

  starts.forEach((start, position) => {
    const end = position + 1 < starts.length ? starts[position + 1] : lines.length;
    const lemma = (lines[start].split('lemma:')[1] ?? '').trim().toLowerCase();
    if (seen.has(lemma)) {
      // Take the blank line above the entry with it, so the file does not grow
      // a run of empty lines where duplicates used to be.
      let from = start;
      while (from > 0 && lines[from - 1].trim() === '') from -= 1;
      dropRanges.push([from, end]);
      removed.push(lemma);
    }
    seen.add(lemma);
  });

  if (dropRanges.length === 0) continue;

  const drop = new Set();
  for (const [from, to] of dropRanges) {
    for (let index = from; index < to; index += 1) drop.add(index);
  }

  const kept = lines.filter((_, index) => !drop.has(index));
  fs.writeFileSync(file, kept.join('\n'), 'utf8');
  removedTotal += removed.length;
  console.log(`${name}: bỏ ${removed.length} từ trùng — ${removed.join(', ')}`);
}

console.log(`\nĐã bỏ ${removedTotal} mục trùng.`);
