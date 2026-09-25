/**
 * Bổ sung IELTS Speaking Part 1 vào ba gói đã soạn trước khi chốt format đề thật.
 *
 * Đề thi có ba phần Speaking; ba gói đầu mới có Part 2 và Part 3. Part 1 là phần
 * hỏi đáp ngắn về bản thân, mỗi câu trả lời hai tới ba câu, không chuẩn bị trước.
 *
 *   node scripts/exams/add-speaking-part1.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../../content/exams');

const PART_ONE = {
  '1': {
    id: 'speaking-part1-hometown',
    title: 'Part 1 — Hometown, work and free time',
    promptEn:
      'Answer each question in two or three sentences.\n1. Where are you from?\n2. What do you like most about the place you live now?\n3. Do you work or are you a student?\n4. What do you usually do at the weekend?\n5. Has the way you spend your free time changed in the last few years?',
    sampleAnswer:
      "1. I'm from Hai Phong, a port city in the north of Vietnam, though I've been living in Hanoi for about four years now for work.\n\n2. Probably how walkable it is. My flat is fifteen minutes from the office on foot, and there's a lake on the way, so I get a bit of quiet at the start and end of the day.\n\n3. I work — I'm a junior data analyst at a logistics company. It's my second job since graduating.\n\n4. Usually something fairly ordinary. I cook properly on Saturdays, because I don't have time during the week, and I try to get out of the city on Sundays if the weather's reasonable.\n\n5. Quite a lot, actually. I used to spend most weekends with a big group of friends, but a few of them moved away, so now it tends to be one or two people and something quieter. I don't mind the change as much as I expected to.",
    rubricVi: [
      'Trả lời 2–3 câu mỗi ý. Trả lời một từ là mất điểm Fluency ngay, còn nói dài như Part 2 thì giám khảo sẽ cắt lời.',
      'Part 1 hỏi về bản thân và thói quen — trả lời thật, không cần ý tưởng sâu sắc. Cố tỏ ra học thuật ở phần này nghe rất giả.',
      "Câu cuối thường có yếu tố so sánh quá khứ với hiện tại ('has it changed'), buộc đổi thì. Đây là chỗ ghi điểm ngữ pháp dễ nhất của cả bài thi.",
      "Thêm một chi tiết nhỏ vào mỗi câu trả lời (tên thành phố, khoảng thời gian, lý do). Chi tiết là thứ biến câu trả lời cụt thành câu trả lời đủ.",
      'Không chuẩn bị trước và không học thuộc. Part 1 chấm phản xạ, giám khảo nhận ra bài học thuộc ngay từ câu thứ hai.',
    ],
  },
  '2': {
    id: 'speaking-part1-routine',
    title: 'Part 1 — Daily routine, technology and travel',
    promptEn:
      'Answer each question in two or three sentences.\n1. Are you a morning person or an evening person?\n2. How do you usually get to work or college?\n3. How often do you use your phone for something other than messaging?\n4. Do you prefer travelling alone or with other people?\n5. Is there anywhere you would like to visit that you have not been to yet?',
    sampleAnswer:
      "1. Definitely a morning person, which is unusual among people my age. I do my best work before ten, and by about nine in the evening I'm not much use to anyone.\n\n2. I cycle, mostly. It takes about twenty-five minutes, and it's faster than the bus once you count the waiting. If it's raining heavily I'll take a taxi, but that's maybe twice a month.\n\n3. Constantly, I'm afraid. Maps, podcasts on the way in, and quite a lot of reading — I probably get through more articles on my phone than I do on a laptop these days.\n\n4. It depends on the trip. For a city I'd rather go with someone, because half the point is talking about what you've seen. For hiking I genuinely prefer being alone; I like being able to stop whenever I want without negotiating.\n\n5. I'd like to see the far north of Vietnam properly — Ha Giang, that area. I've been meaning to go for about three years and something always comes up, which is a poor excuse given it's a day's travel away.",
    rubricVi: [
      "Câu 'Do you prefer A or B?' nên trả lời có điều kiện ('It depends on...') rồi giải thích, thay vì chọn cứng một bên. Cách này thể hiện dải ngôn ngữ tốt hơn.",
      'Trả lời 2–3 câu, có lý do. Câu trả lời chỉ nêu sự thật mà không giải thích sẽ bị hỏi thêm và làm bạn mất nhịp.',
      "Dùng trạng từ tần suất và ước lượng: mostly, maybe twice a month, probably. Đây là ngôn ngữ đời thường mà Part 1 chấm.",
      'Được phép thừa nhận điều không hay về bản thân ("I\'m afraid", "a poor excuse"). Nghe tự nhiên hơn nhiều so với câu trả lời hoàn hảo.',
      'Giữ giọng hội thoại. Part 1 là làm quen, không phải trình bày quan điểm.',
    ],
  },
  '3': {
    id: 'speaking-part1-study',
    title: 'Part 1 — Study, reading and news',
    promptEn:
      'Answer each question in two or three sentences.\n1. What subject are you studying, or what did you study?\n2. Do you prefer studying alone or in a group?\n3. How much do you read outside your studies or work?\n4. Where do you get most of your news?\n5. Do you think people your age follow the news more or less than their parents did?',
    sampleAnswer:
      "1. I studied environmental engineering, and I've stayed fairly close to it — I work on water treatment now, so a lot of what I learned turned out to be directly useful, which I gather isn't always the case.\n\n2. Alone for anything that needs concentration, and in a group for anything I don't understand yet. I've found that explaining something badly to another person exposes the gaps much faster than rereading does.\n\n3. Less than I'd like. Maybe one book every six weeks, plus a fair amount of long-form journalism. I go through phases — if I'm busy at work the reading is the first thing that disappears.\n\n4. Mostly from two or three newsletters I subscribed to deliberately, rather than from social media. I made that switch about two years ago because I noticed I was getting angry at things that turned out not to be true.\n\n5. Differently rather than less, I'd say. My parents watched the evening news at a fixed time and that was that. We get much more of it and much less of a sense of when it stops, and I'm not sure the larger quantity actually leaves us better informed.",
    rubricVi: [
      'Ở mức này Part 1 nên có câu trả lời vừa cụ thể vừa có một nhận xét nhỏ, ví dụ vì sao đổi cách đọc tin. Đó là thứ nâng band ngay ở phần dễ nhất.',
      "Câu so sánh thế hệ nên trả lời bằng cách phân loại ('differently rather than less') thay vì chọn nhiều hay ít. Tránh trả lời một chiều.",
      'Vẫn giữ độ dài 2–3 câu. Part 1 nói quá dài sẽ bị cắt và mất thiện cảm.',
      'Dùng cách nói giảm nhẹ và tự đánh giá: less than I\'d like, I\'m not sure, I gather. Đây là ngôn ngữ tự nhiên của người dùng tiếng Anh thành thạo.',
      'Không dùng từ vựng học thuật của Part 3 ở đây. Sai đăng ký ngôn ngữ cũng bị trừ điểm.',
    ],
  },
};

let changed = 0;
for (const [level, part] of Object.entries(PART_ONE)) {
  const path = resolve(DIR, `ielts-${level}.json`);
  if (!existsSync(path)) continue;
  const pack = JSON.parse(readFileSync(path, 'utf8'));
  if (pack.activities.some((activity) => activity.id === part.id)) continue;

  const activity = {
    id: part.id,
    skill: 'speaking',
    title: part.title,
    format: 'IELTS Speaking — Part 1 · Introduction and interview, 4–5 phút',
    instructionsVi:
      'Trả lời từng câu 2–3 câu, không chuẩn bị trước. Part 1 hỏi về bản thân và thói quen hằng ngày; mục đích là làm quen và đo phản xạ, nên đừng trả lời như bài luận.',
    promptEn: part.promptEn,
    timeLimitSec: 300,
    preparationSec: 0,
    sampleAnswer: part.sampleAnswer,
    rubricVi: part.rubricVi,
  };

  // Part 1 phải đứng trước Part 2 và Part 3 để đúng thứ tự đề thi.
  const firstSpeaking = pack.activities.findIndex((item) => item.skill === 'speaking');
  pack.activities.splice(firstSpeaking < 0 ? pack.activities.length : firstSpeaking, 0, activity);

  writeFileSync(path, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  changed += 1;
}

console.log(`đã thêm Speaking Part 1 vào ${changed} gói`);
