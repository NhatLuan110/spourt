/**
 * Thoát các ký tự xuống dòng thật lọt vào bên trong chuỗi JSON.
 *
 * Soạn văn bản dài nhiều đoạn rất dễ gõ nhầm một dấu Enter thật thay vì \n,
 * và lỗi đó chỉ lộ ra khi JSON.parse chạy tới đúng chỗ. Chạy tệp này để dọn.
 *
 *   node scripts/exams/fix-newlines.mjs content/exams/*.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BACKSLASH = String.fromCharCode(92);
const QUOTE = String.fromCharCode(34);

let fixed = 0;
for (const path of process.argv.slice(2)) {
  const source = readFileSync(path, 'utf8');
  const out = [];
  let inString = false;
  let escaped = false;

  for (const ch of source) {
    if (escaped) {
      out.push(ch);
      escaped = false;
      continue;
    }
    if (inString && ch === BACKSLASH) {
      out.push(ch);
      escaped = true;
      continue;
    }
    if (ch === QUOTE) {
      inString = !inString;
      out.push(ch);
      continue;
    }
    // Xuống dòng thật nằm trong chuỗi là lỗi; ngoài chuỗi là định dạng bình thường.
    if (inString && ch === '\n') {
      out.push(BACKSLASH + 'n');
      fixed += 1;
      continue;
    }
    if (inString && ch === '\r') {
      fixed += 1;
      continue;
    }
    out.push(ch);
  }

  const result = out.join('');
  if (result !== source) writeFileSync(path, result, 'utf8');
}

console.log(`đã thoát ${fixed} ký tự xuống dòng lọt vào chuỗi`);
