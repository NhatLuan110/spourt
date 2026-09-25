/**
 * Cân bằng vị trí đáp án đúng trong các câu trắc nghiệm.
 *
 * Khi soạn tay, người viết có xu hướng đặt đáp án đúng vào cùng một vị trí —
 * gói TOEIC đầu tiên có Part 6 với cả 16 câu đều đáp án A, và toàn bộ đề gần
 * như không có câu nào đáp án D. Thí sinh chọn bừa một chữ cái sẽ được điểm cao
 * bất thường, làm đề mất giá trị đo lường.
 *
 * Tệp này hoán vị lựa chọn của từng câu sao cho đáp án đúng rải đều các vị trí,
 * đồng thời:
 *   - cập nhật trường `answer` theo id mới,
 *   - đổi luôn các tham chiếu dạng "(A)", "(B)"… trong `explanationVi`, nếu
 *     không phần giải thích sẽ chỉ sai chữ cái.
 *
 * Hoán vị dùng bộ sinh số giả ngẫu nhiên có hạt cố định nên chạy lại cho kết
 * quả y hệt, tránh việc mỗi lần chạy lại tạo ra một diff khác nhau.
 *
 *   node scripts/exams/balance-answers.mjs content/exams/_parts/toeic-1/*.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const LETTERS = ['a', 'b', 'c', 'd'];

/** mulberry32 — đủ tốt để trộn đề và tái lập được. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * Xếp lại lựa chọn của một câu sao cho đáp án đúng rơi vào `targetIndex`.
 * Các phương án nhiễu giữ nguyên thứ tự tương đối, chỉ dịch chỗ.
 */
function rebuild(question, targetIndex) {
  const options = question.options ?? [];
  const correct = options.find((option) => option.id === question.answer);
  if (!correct) return null;

  const distractors = options.filter((option) => option.id !== question.answer);
  const ordered = [];
  let cursor = 0;
  for (let index = 0; index < options.length; index += 1) {
    ordered.push(index === targetIndex ? correct : distractors[cursor++]);
  }

  // id cũ của mỗi lựa chọn → id mới theo vị trí sau khi xếp lại.
  const remap = new Map();
  ordered.forEach((option, index) => remap.set(option.id, LETTERS[index]));

  return {
    options: ordered.map((option, index) => ({ id: LETTERS[index], text: option.text })),
    answer: LETTERS[targetIndex],
    remap,
  };
}

/**
 * Đổi "(A)" thành "(C)"… theo bảng ánh xạ, làm một lượt để không đổi chồng.
 * Nhận cả hai lối viết đang có trong kho: "(A)" và "Đáp án A".
 */
function remapExplanation(text, remap) {
  if (!text) return text;
  return text.replace(/\(([A-D])\)|(Đáp án )([A-D])\b/g, (whole, paren, prefix, plain) => {
    const letter = paren ?? plain;
    const next = remap.get(letter.toLowerCase());
    if (!next) return whole;
    return paren ? `(${next.toUpperCase()})` : `${prefix}${next.toUpperCase()}`;
  });
}

let changed = 0;
let scanned = 0;

for (const path of process.argv.slice(2)) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const activities = Array.isArray(parsed) ? parsed : parsed.activities ?? [];

  for (const activity of activities) {
    if (!activity.questions) continue;

    // Đếm riêng theo từng hoạt động, để mỗi bài đọc/bài nghe tự cân bằng.
    const used = new Map(LETTERS.map((letter) => [letter, 0]));
    const random = seeded(hash(activity.id));

    for (const question of activity.questions) {
      if (question.kind !== 'mcq' || !question.options) continue;
      scanned += 1;

      const width = question.options.length;
      const slots = LETTERS.slice(0, width);
      // Ưu tiên vị trí đang được dùng ít nhất; hoà thì bốc ngẫu nhiên có hạt.
      const fewest = Math.min(...slots.map((letter) => used.get(letter)));
      const candidates = slots.filter((letter) => used.get(letter) === fewest);
      const target = candidates[Math.floor(random() * candidates.length)];
      const targetIndex = LETTERS.indexOf(target);

      const result = rebuild(question, targetIndex);
      if (!result) continue;

      question.options = result.options;
      question.answer = result.answer;
      question.explanationVi = remapExplanation(question.explanationVi, result.remap);
      used.set(target, used.get(target) + 1);
      changed += 1;
    }
  }

  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

console.log(`đã cân bằng ${changed}/${scanned} câu trắc nghiệm`);
