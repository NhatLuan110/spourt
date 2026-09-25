/**
 * §13 P3 demo, chạy thật qua API và Gemini:
 * nộp một bài viết, nhận chấm điểm có tiêu chí và bản sửa.
 *
 * Chạy: pnpm --filter @sprout/api exec dotenv -e ../../.env -- tsx ../../scripts/demo-p3.ts
 * Tốn hạn mức AI thật, nên chạy tay chứ không nằm trong `pnpm test`.
 */
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:4000/api/v1';
const EMAIL = `p3demo-${Date.now()}@sprout.local`;
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
  const json = (await response.json()) as { data: T; error?: { code: string; message: string } };
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

/** Bài viết cố tình mắc đúng những lỗi người Việt hay mắc. */
const ESSAY = [
  'Hi everyone,',
  '',
  'My name is Minh and I am live in Hanoi. I am student at university, I study',
  'computer science in three years. Yesterday I go to the library and I have',
  'borrowed two book about programming.',
  '',
  'In my free time I like play badminton with my friend. I play it every weekend',
  'because it make me feel relax. I also like listen music, specially rock music.',
  '',
  'I learning English because I want work in a international company. I think',
  'English is very important for my future, and I hope I can improve it more',
  'better.',
  '',
  'Minh',
].join('\n');

async function main(): Promise<void> {
  const registered = await call<{ accessToken: string }>('POST', '/auth/register', {
    email: EMAIL,
    password: 'demoP3phase2026',
    displayName: 'Minh',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  token = registered.accessToken;

  console.log('1. ĐỀ BÀI');
  const prompts = await call<
    { slug: string; title: string; cefr: string; kind: string; minWords: number; maxWords: number; sampleAnswer: string | null }[]
  >('GET', '/writing/prompts');
  console.log(`   ${prompts.length} đề, từ ${prompts[0]?.cefr} đến ${prompts.at(-1)?.cefr}`);
  const prompt = prompts.find((entry) => entry.slug === 'introduce-yourself-email');
  console.log(`   chọn: "${prompt?.title}" (${prompt?.minWords}–${prompt?.maxWords} từ)`);
  console.log(
    `   bài mẫu trước khi làm: ${prompt?.sampleAnswer === null ? 'ẩn (đúng)' : 'HIỆN — sai'}`,
  );

  console.log('\n2. NỘP BÀI');
  console.log(`   ${ESSAY.split(/\s+/).filter(Boolean).length} từ, cố tình sai nhiều chỗ`);
  const started = Date.now();

  const result = await call<{
    id: string;
    wordCount: number;
    status: string;
    feedback: {
      overallScore: number;
      cefrEstimate: string;
      criteria: { criterion: string; score: number; commentVi: string }[];
      issues: {
        start: number;
        end: number;
        original: string;
        suggestion: string;
        category: string;
        severity: string;
        whyVi: string;
      }[];
      rewrite: string;
      strengths: string[];
      nextSteps: { labelVi: string }[];
    } | null;
  }>('POST', '/writing/submissions', {
    promptSlug: 'introduce-yourself-email',
    content: ESSAY,
  });

  console.log(`   chấm xong sau ${((Date.now() - started) / 1000).toFixed(1)}s · trạng thái ${result.status}`);

  const feedback = result.feedback;
  if (!feedback) {
    console.log('   KHÔNG CÓ PHẢN HỒI');
    return;
  }

  console.log('\n3. ĐIỂM THEO TIÊU CHÍ');
  console.log(`   tổng: ${feedback.overallScore}/100 · ước lượng ${feedback.cefrEstimate}`);
  for (const criterion of feedback.criteria) {
    console.log(`   ${criterion.criterion.padEnd(13)} ${criterion.score}/10 — ${criterion.commentVi.slice(0, 90)}`);
  }

  console.log(`\n4. LỖI ĐƯỢC CHỈ RA (${feedback.issues.length})`);
  let anchored = 0;
  for (const issue of feedback.issues.slice(0, 6)) {
    const inText = ESSAY.slice(issue.start, issue.end);
    const exact = inText === issue.original;
    if (exact) anchored += 1;
    console.log(
      `   [${issue.category}/${issue.severity}] "${issue.original}" → "${issue.suggestion}"`,
    );
    console.log(`      ${issue.whyVi.slice(0, 100)}`);
    if (!exact) console.log(`      ⚠ offset lệch: text ở đó là "${inText}"`);
  }
  const checked = feedback.issues.slice(0, 6).length;
  console.log(`   offset đúng: ${anchored}/${checked}`);

  console.log('\n5. BẢN VIẾT LẠI');
  console.log(
    feedback.rewrite
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .slice(0, 4)
      .map((line) => `   ${line.trim()}`)
      .join('\n'),
  );

  console.log('\n6. ĐIỂM MẠNH VÀ VIỆC TIẾP THEO');
  for (const strength of feedback.strengths.slice(0, 3)) console.log(`   + ${strength.slice(0, 100)}`);
  for (const step of feedback.nextSteps.slice(0, 3)) console.log(`   → ${step.labelVi.slice(0, 100)}`);

  console.log('\n7. HỆ QUẢ');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const [usage, mistakes, score] = await Promise.all([
    prisma.aiUsageLog.findMany({ where: { userId: user.id } }),
    prisma.mistakeLog.count({ where: { userId: user.id, skill: 'WRITING' } }),
    prisma.skillScore.findFirst({ where: { userId: user.id, skill: 'WRITING' } }),
  ]);
  console.log(`   AiUsageLog: ${usage.length} lượt · model ${usage[0]?.model} · ${usage[0]?.tokensIn} token vào, ${usage[0]?.tokensOut} ra`);
  console.log(`   MistakeLog: ${mistakes} lỗi ghi vào sổ`);
  console.log(`   SkillScore WRITING: ${Math.round(score?.score ?? 0)}/100`);

  const again = await call<{ feedback: { overallScore: number } | null }>(
    'GET',
    `/writing/submissions/${result.id}`,
  );
  console.log(`   đọc lại được kết quả: ${again.feedback?.overallScore === feedback.overallScore}`);

  console.log('\n8. HẠN MỨC (§10.1 — 3 bài/ngày)');
  for (let attempt = 2; attempt <= 4; attempt += 1) {
    try {
      await call('POST', '/writing/submissions', {
        freeTopic: 'A short note about my weekend',
        content: 'I went to the park on Saturday. It was sunny and I met two friends there.',
      });
      console.log(`   bài thứ ${attempt}: được chấm`);
    } catch (error) {
      const message = String(error);
      const blocked = message.includes('AI_QUOTA_EXCEEDED');
      console.log(`   bài thứ ${attempt}: ${blocked ? 'bị chặn đúng hạn mức' : 'lỗi khác — ' + message.slice(0, 120)}`);
      break;
    }
  }

  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
