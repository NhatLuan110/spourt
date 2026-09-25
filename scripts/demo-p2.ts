/**
 * §13 P2 demo, run against the live API and the real database:
 * học một bài ngữ pháp, đọc một bài có tra từ tại chỗ, nghe một bài có transcript
 * và chép chính tả.
 *
 * Chạy: pnpm --filter @sprout/api exec tsx ../../scripts/demo-p2.ts
 * Cần API đang chạy ở cổng 4000 và database đã seed.
 */
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:4000/api/v1';
const EMAIL = `p2demo-${Date.now()}@sprout.local`;
const prisma = new PrismaClient();

let token = '';

interface Envelope<T> {
  data: T;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await response.json()) as Envelope<T>;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

/** The answer the content author wrote, read straight from the Exercise row. */
async function correctAnswer(exerciseId: string): Promise<string> {
  const row = await prisma.exercise.findUniqueOrThrow({ where: { id: exerciseId } });
  const stored = row.answer as Record<string, unknown>;
  if (typeof stored['optionId'] === 'string') return stored['optionId'];
  if (typeof stored['value'] === 'boolean') return String(stored['value']);
  if (Array.isArray(stored['order'])) return JSON.stringify(stored['order']);
  if (Array.isArray(stored['accept'])) return String(stored['accept'][0]);
  if (typeof stored['text'] === 'string') return stored['text'];
  throw new Error(`Không đọc được đáp án của ${exerciseId}`);
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

interface Exercise {
  id: string;
  mode: string;
  prompt: string;
  speakText?: string;
}

async function main(): Promise<void> {
  const registered = await call<{ accessToken: string }>('POST', '/auth/register', {
    email: EMAIL,
    password: 'demoP2phase2026',
    displayName: 'Người học P2',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  token = registered.accessToken;

  // ---- 1. Ngữ pháp --------------------------------------------------------
  console.log('1. NGỮ PHÁP');
  const lessons = await call<
    { slug: string; titleVi: string; cefr: string; lock: { locked: boolean } }[]
  >('GET', '/grammar/lessons');
  const locked = lessons.filter((lesson) => lesson.lock.locked);
  console.log(`   ${lessons.length} bài học A1–B2, ${locked.length} bài khoá vì chưa xong bài trước`);

  const lesson = await call<{
    titleVi: string;
    sections: { kind: string; bodyMdx: string }[];
    exercises: Exercise[];
  }>('GET', '/grammar/lessons/present-simple');
  console.log(
    `   "${lesson.titleVi}": ${lesson.sections.length} phần (${lesson.sections
      .map((section) => section.kind)
      .join(', ')}), ${lesson.exercises.length} bài tập`,
  );
  console.log(`   dạng bài: ${[...new Set(lesson.exercises.map((item) => item.mode))].join(', ')}`);

  const started = await call<{ sessionId: string }>(
    'POST',
    '/grammar/lessons/present-simple/start',
  );

  const answers = [];
  for (const [index, exercise] of lesson.exercises.entries()) {
    const last = index === lesson.exercises.length - 1;
    answers.push({
      exerciseId: exercise.id,
      answer: last ? 'cố tình trả lời sai' : await correctAnswer(exercise.id),
      timeSpentMs: 6000,
    });
  }

  const graded = await call<{
    correctCount: number;
    total: number;
    accuracy: number;
    feedback: { isCorrect: boolean; explanationVi: string; correctAnswer: string }[];
    reward: { xpEarned: number };
  }>('POST', '/grammar/lessons/present-simple/submit', {
    sessionId: started.sessionId,
    answers,
  });

  console.log(
    `   nộp bài: ${graded.correctCount}/${graded.total} đúng, ${pct(graded.accuracy)}, +${graded.reward.xpEarned} XP`,
  );
  const wrong = graded.feedback.find((item) => !item.isCorrect);
  console.log(`   câu sai vẫn được giải thích: "${wrong?.explanationVi.slice(0, 64)}…"`);

  const after = await call<{ slug: string; titleVi: string; lock: { locked: boolean } }[]>(
    'GET',
    '/grammar/lessons',
  );
  const next = after.find((item) => item.slug === 'there-is-there-are');
  console.log(
    `   sau khi hoàn thành: "${next?.titleVi}" ${next?.lock.locked ? 'vẫn khoá' : 'đã mở khoá'}`,
  );

  // ---- 2. Đọc -------------------------------------------------------------
  console.log('\n2. ĐỌC HIỂU');
  const passages = await call<{ wordCount: number }[]>('GET', '/reading/passages');
  console.log(
    `   ${passages.length} bài đọc, tổng ${passages.reduce((sum, p) => sum + p.wordCount, 0)} từ`,
  );

  const slug = 'what-happens-to-plastic-in-the-mekong';
  const passage = await call<{
    titleVi: string;
    wordCount: number;
    questionCount: number;
    bodyMdx: string;
    glossary: { lemma: string; offsetStart: number; offsetEnd: number; definitionVi: string }[];
    questions: Exercise[];
  }>('GET', `/reading/passages/${slug}`);
  console.log(`   "${passage.titleVi}": ${passage.wordCount} từ, ${passage.questionCount} câu hỏi`);
  console.log(`   ${passage.glossary.length} từ tra được ngay trong bài:`);
  for (const entry of passage.glossary.slice(0, 3)) {
    const inText = passage.bodyMdx.slice(entry.offsetStart, entry.offsetEnd);
    console.log(`     "${inText}" → ${entry.definitionVi.slice(0, 44)}`);
  }

  const readStart = await call<{ sessionId: string }>('POST', `/reading/passages/${slug}/start`);
  const readAnswers = [];
  for (const question of passage.questions) {
    readAnswers.push({
      exerciseId: question.id,
      answer: await correctAnswer(question.id),
      timeSpentMs: 9000,
    });
  }
  const readResult = await call<{
    correctCount: number;
    total: number;
    reward: { xpEarned: number };
    speed: { wpm: number; targetWpm: number; band: string };
  }>('POST', `/reading/passages/${slug}/submit`, {
    sessionId: readStart.sessionId,
    answers: readAnswers,
  });
  console.log(
    `   nộp bài: ${readResult.correctCount}/${readResult.total} đúng, +${readResult.reward.xpEarned} XP`,
  );
  console.log(
    `   tốc độ đọc: ${readResult.speed.wpm} từ/phút (chuẩn ${readResult.speed.targetWpm}) → "${readResult.speed.band}"`,
  );

  // ---- 3. Nghe ------------------------------------------------------------
  console.log('\n3. NGHE');
  const tracks = await call<{ accent: string; durationSec: number }[]>('GET', '/listening/tracks');
  console.log(
    `   ${tracks.length} bài nghe, giọng ${[...new Set(tracks.map((t) => t.accent))].join(' và ')}`,
  );

  const trackSlug = 'a-doctors-appointment';
  const track = await call<{
    titleVi: string;
    durationSec: number;
    questionCount: number;
    audioUrl: string;
    transcript: { order: number; speaker: string | null; translationVi: string | null }[];
    questions: Exercise[];
    dictation: Exercise[];
  }>('GET', `/listening/tracks/${trackSlug}`);
  console.log(
    `   "${track.titleVi}": ${track.transcript.length} đoạn / ${track.durationSec}s, ${track.questionCount} câu hỏi, ${track.dictation.length} câu chép chính tả`,
  );
  console.log(
    `   audioUrl = ${JSON.stringify(track.audioUrl)} → trình duyệt đọc transcript (D-033)`,
  );
  console.log(
    `   mọi đoạn đều có bản dịch: ${track.transcript.every((s) => s.translationVi !== null)}`,
  );

  const listenStart = await call<{ sessionId: string }>('POST', `/listening/tracks/${trackSlug}/start`);
  const listenAnswers = [];
  for (const question of track.questions) {
    listenAnswers.push({
      exerciseId: question.id,
      answer: await correctAnswer(question.id),
      timeSpentMs: 11000,
    });
  }
  for (const [index, line] of track.dictation.entries()) {
    const reference = await correctAnswer(line.id);
    listenAnswers.push({
      exerciseId: line.id,
      // Câu đầu chép đúng, các câu sau bỏ sót hai từ cuối để thấy diff.
      answer: index === 0 ? reference : reference.split(' ').slice(0, -2).join(' '),
      timeSpentMs: 25000,
    });
  }

  const listenResult = await call<{
    correctCount: number;
    total: number;
    reward: { xpEarned: number };
    dictation: {
      score: number;
      tokens: { status: string; expected: string | null }[];
    }[];
  }>('POST', `/listening/tracks/${trackSlug}/submit`, {
    sessionId: listenStart.sessionId,
    answers: listenAnswers,
    playback: { playbackRate: 0.75, replays: 6, transcriptShown: false },
  });

  console.log(
    `   nộp bài: ${listenResult.correctCount}/${listenResult.total} đúng, +${listenResult.reward.xpEarned} XP`,
  );
  for (const line of listenResult.dictation) {
    const missing = line.tokens
      .filter((tokenised) => tokenised.status === 'missing')
      .map((tokenised) => tokenised.expected);
    console.log(
      `   chép chính tả ${pct(line.score)}${missing.length > 0 ? ` — thiếu: ${missing.join(' ')}` : ' — chính xác từng từ'}`,
    );
  }

  // ---- 4. Tổng kết --------------------------------------------------------
  console.log('\n4. TỔNG KẾT');
  const dashboard = await call<{
    progress: { totalXp: number; level: { level: number } };
    tree: { emoji: string; nameVi: string; flowers: number };
  }>('GET', '/me/dashboard');
  console.log(
    `   ${dashboard.progress.totalXp} XP · cấp ${dashboard.progress.level.level} · cây ${dashboard.tree.emoji} ${dashboard.tree.nameVi} · ${dashboard.tree.flowers} hoa`,
  );

  const skills = await call<{
    skills: { skill: string; score: number; cefrEstimate: string | null; confidence: number }[];
    overall: { score: number; cefr: string };
  }>('GET', '/me/skills');
  for (const skill of skills.skills.filter((entry) => entry.confidence > 0)) {
    console.log(
      `   ${skill.skill}: ${Math.round(skill.score)}/100 · ${skill.cefrEstimate ?? 'chưa đủ dữ liệu'}`,
    );
  }
  console.log(`   tổng thể: ${Math.round(skills.overall.score)}/100 · ${skills.overall.cefr}`);

  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
