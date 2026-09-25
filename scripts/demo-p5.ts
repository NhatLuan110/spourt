/**
 * §13 P5 demo, run against the live API and the real database:
 * làm bài kiểm tra đầu vào ra được trình độ CEFR, và trang phân tích chỉ đúng
 * điểm yếu.
 *
 * Chạy: pnpm --filter @sprout/api exec dotenv -e ../../.env -- tsx ../../scripts/demo-p5.ts
 */
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:4000/api/v1';
const EMAIL = `p5demo-${Date.now()}@sprout.local`;
const prisma = new PrismaClient();

let token = '';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await response.json()) as { data: T };
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

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

interface RunState {
  attemptId: string;
  next: {
    exercise: { id: string; mode: string };
    skill: string;
    cefr: string;
    position: number;
  } | null;
  answered: number;
  secondsRemaining: number | null;
}

async function main(): Promise<void> {
  const registered = await call<{ accessToken: string }>('POST', '/auth/register', {
    email: EMAIL,
    password: 'demoP5phase2026',
    displayName: 'Người học P5',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  token = registered.accessToken;

  // ---- 1. Bài kiểm tra đầu vào -------------------------------------------
  console.log('1. KIỂM TRA ĐẦU VÀO (thích ứng)');
  const tests = await call<{ slug: string; title: string; questionCount: number; isAdaptive: boolean }[]>(
    'GET',
    '/tests',
  );
  const placement = tests.find((test) => test.slug === 'placement');
  console.log(
    `   "${placement?.title}": ${placement?.questionCount} câu trong ngân hàng, thích ứng = ${placement?.isAdaptive}`,
  );

  let state = await call<RunState>('POST', '/tests/placement/start');
  const walk: string[] = [];

  // Người học giả định: chắc ngữ pháp tới B1, đuối ở B2 trở lên, và yếu đọc.
  while (state.next) {
    const question = state.next;
    walk.push(`${question.cefr}${question.skill[0]}`);

    const strongEnough =
      question.skill !== 'READING' && ['A1', 'A2', 'B1'].includes(question.cefr);
    const answer = strongEnough ? await correctAnswer(question.exercise.id) : 'chac chan sai';

    state = await call<RunState>('POST', '/tests/placement/answer', {
      answers: [{ exerciseId: question.exercise.id, answer, timeSpentMs: 7000 }],
    });
  }

  console.log(`   đã hỏi ${walk.length} câu, đường đi độ khó: ${walk.join(' → ')}`);

  const result = await call<{
    attemptId: string;
    totalScore: number;
    maxScore: number;
    accuracy: number;
    cefrResult: string | null;
    skills: { skill: string; correct: number; asked: number; score: number; cefr: string }[];
    adviceVi: string[];
    profileUpdated: boolean;
  }>('POST', '/tests/placement/finish');

  console.log(
    `   kết quả: ${Math.round(result.totalScore)}/${result.maxScore} câu (${Math.round(result.accuracy * 100)}%) → trình độ ${result.cefrResult}`,
  );
  for (const skill of [...result.skills].sort((a, b) => a.score - b.score)) {
    console.log(
      `     ${skill.skill.padEnd(11)} ${String(skill.correct).padStart(2)}/${skill.asked} câu · ${String(skill.score).padStart(3)}/100 · ${skill.cefr}`,
    );
  }
  for (const line of result.adviceVi) console.log(`   → ${line}`);
  console.log(`   ghi vào hồ sơ: ${result.profileUpdated}`);

  const me = await call<{ profile: { currentLevel: string } }>('GET', '/me');
  console.log(`   hồ sơ giờ ghi trình độ: ${me.profile.currentLevel}`);

  // ---- 2. Tạo thêm dữ liệu để phân tích có gì mà chỉ ----------------------
  console.log('\n2. HỌC THÊM ĐỂ CÓ DỮ LIỆU');
  const lesson = await call<{ exercises: { id: string }[] }>(
    'GET',
    '/grammar/lessons/present-simple',
  );
  const grammarAnswers = [];
  for (const [index, exercise] of lesson.exercises.entries()) {
    grammarAnswers.push({
      exerciseId: exercise.id,
      // Sai hai câu cuối, để độ chính xác không phải 100%.
      answer:
        index >= lesson.exercises.length - 2
          ? 'sai rồi'
          : await correctAnswer(exercise.id),
      timeSpentMs: 6000,
    });
  }
  await call('POST', '/grammar/lessons/present-simple/submit', { answers: grammarAnswers });
  console.log(`   làm bài ngữ pháp: ${grammarAnswers.length} câu, sai 2`);

  const passage = await call<{ questions: { id: string }[] }>(
    'GET',
    '/reading/passages/sleeping-better-on-a-busy-week',
  );
  const readingAnswers = [];
  for (const [index, question] of passage.questions.entries()) {
    readingAnswers.push({
      exerciseId: question.id,
      // Đọc yếu: chỉ đúng câu đầu.
      answer: index === 0 ? await correctAnswer(question.id) : 'sai rồi',
      timeSpentMs: 8000,
    });
  }
  await call('POST', '/reading/passages/sleeping-better-on-a-busy-week/submit', {
    answers: readingAnswers,
  });
  console.log(`   làm bài đọc: ${readingAnswers.length} câu, đúng 1`);

  // ---- 3. Phân tích -------------------------------------------------------
  console.log('\n3. PHÂN TÍCH (30 ngày)');
  const analytics = await call<{
    from: string;
    to: string;
    daily: unknown[];
    totals: {
      xp: number;
      minutes: number;
      activeDays: number;
      accuracy: number | null;
      currentStreak: number;
    };
    skills: {
      skill: string;
      score: number;
      periodAccuracy: number | null;
      attempts: number;
      lowConfidence: boolean;
    }[];
    overall: { score: number; cefr: string };
    mistakes: { labelVi: string; count: number }[];
    weakSpots: { label: string; reasonVi: string }[];
    insightsVi: string[];
  }>('GET', '/me/analytics?period=30d');

  console.log(`   khoảng ${analytics.from} → ${analytics.to} (${analytics.daily.length} ngày)`);
  console.log(
    `   ${analytics.totals.xp} XP · ${analytics.totals.minutes} phút · ${analytics.totals.activeDays} ngày có học · chuỗi ${analytics.totals.currentStreak}`,
  );
  console.log('   theo kỹ năng:');
  for (const skill of analytics.skills) {
    const measured =
      skill.attempts === 0
        ? 'chưa luyện'
        : `${Math.round((skill.periodAccuracy ?? 0) * 100)}% trên ${skill.attempts} câu`;
    console.log(
      `     ${skill.skill.padEnd(11)} ${String(Math.round(skill.score)).padStart(3)}/100 · ${measured}${skill.lowConfidence ? ' (sơ bộ)' : ''}`,
    );
  }
  console.log(`   tổng thể: ${Math.round(analytics.overall.score)}/100 · ${analytics.overall.cefr}`);
  console.log('   lỗi hay gặp:');
  for (const group of analytics.mistakes) console.log(`     ${group.labelVi}: ${group.count}`);
  console.log(`   chỗ cần ôn: ${analytics.weakSpots.length === 0 ? '(chưa đủ dữ liệu)' : ''}`);
  for (const spot of analytics.weakSpots) console.log(`     ${spot.label} — ${spot.reasonVi}`);
  console.log('   nhận xét:');
  for (const line of analytics.insightsVi) console.log(`     · ${line}`);

  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
