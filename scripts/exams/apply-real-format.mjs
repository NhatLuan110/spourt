/**
 * Đưa nhãn Part và thời gian của các gói IELTS đã soạn về đúng cấu trúc đề thật.
 *
 * Ba gói đầu được soạn trước khi chốt yêu cầu "đúng format đề thi", nên phần
 * nội dung thì đạt nhưng phần khai báo Part và thời lượng còn tuỳ tiện. Tệp này
 * chỉ sửa siêu dữ liệu, không đụng vào bài đọc, bản chép lời hay đáp án.
 *
 *   node scripts/exams/apply-real-format.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../../content/exams');

/**
 * Thời lượng quy đổi theo đề thật.
 *
 * IELTS Reading: 60 phút cho 40 câu, tức 90 giây một câu. Đề luyện siết còn 75
 * giây để khi vào phòng thi người học thấy dư giờ chứ không thiếu.
 * IELTS Listening: băng chạy một lần, 30 phút cho 40 câu; ở đây tính theo số câu
 * cộng thời gian đọc câu hỏi.
 */
const READING_SEC_PER_QUESTION = 75;
const LISTENING_SEC_PER_QUESTION = 70;

/** Nhãn Part đúng tên gọi trong đề thi, khớp theo id hoạt động. */
const IELTS_FORMAT = {
  reading: [
    'IELTS Academic Reading — Passage 1 · Multiple choice + Sentence completion',
    'IELTS Academic Reading — Passage 2 · Identifying information (True/False/Not Given)',
    'IELTS Academic Reading — Passage 3 · Matching headings / Matching information',
  ],
  listening: [
    'IELTS Listening — Section 1 · Hội thoại đời thường, hai người, form completion',
    'IELTS Listening — Section 2 · Độc thoại đời thường',
    'IELTS Listening — Section 4 · Bài giảng học thuật, không nghỉ giữa chừng',
  ],
  writing: [
    'IELTS Academic Writing — Task 1 · 20 phút, tối thiểu 150 từ',
    'IELTS Academic Writing — Task 2 · 40 phút, tối thiểu 250 từ, chiếm 2/3 điểm Writing',
  ],
  speaking: [
    'IELTS Speaking — Part 2 · Long turn, 1 phút chuẩn bị, 1–2 phút nói',
    'IELTS Speaking — Part 3 · Two-way discussion, 4–5 phút',
  ],
};

let changed = 0;

for (const level of ['1', '2', '3', '4']) {
  const path = resolve(DIR, `ielts-${level}.json`);
  if (!existsSync(path)) continue;
  const pack = JSON.parse(readFileSync(path, 'utf8'));

  const seen = { reading: 0, listening: 0, writing: 0, speaking: 0 };
  for (const activity of pack.activities) {
    const index = seen[activity.skill];
    seen[activity.skill] += 1;

    const label = IELTS_FORMAT[activity.skill]?.[index];
    if (label) activity.format = label;

    // Thời gian bám theo tốc độ làm bài thật, tính trên số câu của chính bài đó.
    if (activity.skill === 'reading' && activity.questions) {
      activity.timeLimitSec = activity.questions.length * READING_SEC_PER_QUESTION;
    }
    if (activity.skill === 'listening' && activity.questions) {
      activity.timeLimitSec = activity.questions.length * LISTENING_SEC_PER_QUESTION;
    }
    if (activity.skill === 'writing') {
      // Task 1 là 20 phút, Task 2 là 40 phút — tỉ lệ cố định của đề thật.
      activity.timeLimitSec = index === 0 ? 1200 : 2400;
    }
    if (activity.skill === 'speaking' && index === 0) {
      activity.timeLimitSec = 120;
      activity.preparationSec = 60;
    }
  }

  writeFileSync(path, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  changed += 1;
}

console.log(`đã chuẩn hoá nhãn Part và thời lượng cho ${changed} gói IELTS`);
