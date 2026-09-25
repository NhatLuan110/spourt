/**
 * Ghép các mảnh nội dung thành một gói ôn thi hoàn chỉnh.
 *
 * Một đề TOEIC đầy đủ có 200 câu, viết thẳng vào một tệp JSON thì quá lớn để
 * soạn và sửa. Nên mỗi Part được soạn thành một mảnh riêng trong
 * `content/exams/_parts/<pack>/`, và tệp này ghép chúng lại theo đúng thứ tự
 * Part của đề thi.
 *
 *   node scripts/exams/build-pack.mjs toeic-1
 *   node scripts/exams/build-pack.mjs            # ghép mọi gói có thư mục mảnh
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const PARTS_DIR = join(ROOT, 'content/exams/_parts');
const OUT_DIR = join(ROOT, 'content/exams');

/** Thứ tự Part trong đề thi. Mảnh nào không có trong danh sách thì xếp cuối. */
const ORDER = [
  'meta',
  'listening-part1',
  'listening-part2',
  'listening-part3',
  'listening-part4',
  'reading-part5',
  'reading-part6',
  'reading-part7',
  'writing',
  'speaking',
];

/**
 * Một Part dài có thể được chia thành nhiều mảnh (`listening-part3a`,
 * `listening-part3b`…), nên khớp theo tiền tố dài nhất thay vì khớp đúng tên.
 */
function rank(name) {
  const base = name.replace(/\.json$/, '');
  let best = ORDER.length;
  ORDER.forEach((entry, index) => {
    if (base === entry || base.startsWith(entry)) best = Math.min(best, index);
  });
  return best;
}

function build(packName) {
  const dir = join(PARTS_DIR, packName);
  if (!existsSync(dir)) throw new Error(`Không có thư mục mảnh: ${dir}`);

  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const pack = { examId: meta.examId, levelId: meta.levelId, vocabulary: meta.vocabulary, activities: [] };

  for (const file of files) {
    if (file === 'meta.json') continue;
    const fragment = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    // Mỗi mảnh là một mảng hoạt động, hoặc một hoạt động đơn lẻ.
    pack.activities.push(...(Array.isArray(fragment) ? fragment : [fragment]));
  }

  const questions = pack.activities.reduce((sum, a) => sum + (a.questions?.length ?? 0), 0);
  writeFileSync(join(OUT_DIR, `${packName}.json`), `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  console.log(
    `  ${packName}: ${files.length - 1} mảnh → ${pack.activities.length} hoạt động, ${questions} câu hỏi`,
  );
}

const target = process.argv[2];
if (target) {
  build(target);
} else if (existsSync(PARTS_DIR)) {
  for (const name of readdirSync(PARTS_DIR)) build(name);
} else {
  console.log('Chưa có thư mục mảnh nào.');
}
