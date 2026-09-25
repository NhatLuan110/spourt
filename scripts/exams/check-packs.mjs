/**
 * Kiểm tra 12 gói nội dung ôn thi bằng chính schema mà API dùng.
 *
 * Chạy: node scripts/exams/check-packs.mjs
 * Soạn nội dung tới đâu chạy tới đó, khỏi phải build API mới biết sai chỗ nào.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { examContentPackSchema, EXAM_IDS, EXAM_LEVEL_IDS, EXAM_SKILLS } from '../../packages/shared/dist/index.js';

const DIR = resolve(import.meta.dirname, '../../content/exams');
let missing = 0, bad = 0;

for (const exam of EXAM_IDS) {
  for (const level of EXAM_LEVEL_IDS) {
    const key = `${exam}-${level}`;
    const path = resolve(DIR, `${key}.json`);
    if (!existsSync(path)) { console.log(`  ${key.padEnd(10)} chưa soạn`); missing += 1; continue; }

    const result = examContentPackSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    if (!result.success) {
      bad += 1;
      console.log(`  ${key.padEnd(10)} LỖI`);
      for (const issue of result.error.issues.slice(0, 6)) {
        console.log(`      ${issue.path.join('.') || '(gốc)'}: ${issue.message}`);
      }
      continue;
    }

    const pack = result.data;
    const bySkill = Object.fromEntries(
      EXAM_SKILLS.map((skill) => [skill, pack.activities.filter((a) => a.skill === skill).length]),
    );
    const questions = pack.activities.reduce((sum, a) => sum + (a.questions?.length ?? 0), 0);
    console.log(
      `  ${key.padEnd(10)} ok · ${String(pack.vocabulary.length).padStart(2)} từ · ` +
      `đọc ${bySkill.reading} nghe ${bySkill.listening} viết ${bySkill.writing} nói ${bySkill.speaking} · ${questions} câu hỏi`,
    );
  }
}
console.log(`\n${missing} gói chưa soạn, ${bad} gói sai schema.`);
process.exitCode = bad > 0 ? 1 : 0;
