/**
 * §13 P4 demo, chạy thật qua API và Gemini:
 * đọc một câu, được chấm phát âm và chỉ ra âm sai; nói chuyện theo tình huống.
 *
 * Không có micro trong script, nên audio được TẠO bằng chính TTS của Gemini:
 *  - đọc đúng câu   -> điểm phải cao
 *  - đọc thiếu từ   -> phải bị bắt là nuốt từ
 *  - đọc sai âm th  -> phải bị bắt là đọc sai
 *
 * Chạy: pnpm --filter @sprout/api exec dotenv -e ../../.env -- tsx ../../scripts/demo-p4.ts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:4000/api/v1';
const EMAIL = `p4demo-${Date.now()}@sprout.local`;
const prisma = new PrismaClient();

const KEY = readFileSync('E:/sprout/.env', 'utf8')
  .split('\n')
  .find((line) => line.startsWith('AI_API_KEY='))
  ?.slice('AI_API_KEY='.length)
  .trim();

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
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  return json.data;
}

/** Sinh audio WAV từ chữ, để thay cho micro. */
async function speak(text: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      }),
    },
  );
  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[];
  };
  const inline = json.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (!inline) throw new Error('TTS không trả về audio');

  const pcm = Buffer.from(inline.data, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString('base64');
}

interface Attempt {
  transcript: string;
  scores: { accuracy: number; fluency: number; completeness: number; prosody: number | null; overall: number };
  bandLabelVi: string;
  words: { word: string; score: number; errorType: string; color: string }[];
  feedbackVi: string;
  issues: { phoneme: string; labelVi: string; tipVi: string }[];
  wpm: number;
  targetWpm: { min: number; max: number };
}

async function main(): Promise<void> {
  const registered = await call<{ accessToken: string }>('POST', '/auth/register', {
    email: EMAIL,
    password: 'demoP4phase2026',
    displayName: 'Minh',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  token = registered.accessToken;

  const caps = await call<{ canTranscribe: boolean; canSpeak: boolean; provider: string }>(
    'GET',
    '/speaking/capabilities',
  );
  console.log(`Khả năng: nghe ${caps.canTranscribe} · đọc ${caps.canSpeak} · ${caps.provider}`);

  console.log('\n1. BÀI LUYỆN');
  const drills = await call<{ slug: string; text: string; focus: string; focusLabelVi: string }[]>(
    'GET',
    '/speaking/drills',
  );
  const focuses = [...new Set(drills.map((drill) => drill.focus))];
  console.log(`   ${drills.length} bài, phủ ${focuses.length}/9 nhóm lỗi §7.6.3`);
  console.log(`   ${focuses.join(', ')}`);

  const drill = drills.find((entry) => entry.slug === 'th-think-three');
  if (!drill) throw new Error('không tìm thấy bài luyện th');
  console.log(`\n   chọn: "${drill.text}" (${drill.focusLabelVi})`);

  // --- Lần 1: đọc đúng ------------------------------------------------------
  console.log('\n2. ĐỌC ĐÚNG');
  const good = await call<Attempt>('POST', '/speaking/attempts', {
    drillSlug: drill.slug,
    audioBase64: await speak(drill.text),
    mimeType: 'audio/wav',
    durationMs: 3200,
  });
  report(good);

  // --- Lần 2: nuốt mất hai từ ----------------------------------------------
  console.log('\n3. NUỐT MẤT TỪ (bỏ "there are")');
  const clipped = await call<Attempt>('POST', '/speaking/attempts', {
    drillSlug: drill.slug,
    audioBase64: await speak('I think three things'),
    mimeType: 'audio/wav',
    durationMs: 2400,
  });
  report(clipped);

  // --- Lần 3: đọc th thành s ------------------------------------------------
  console.log('\n4. ĐỌC SAI ÂM th THÀNH s');
  const wrong = await call<Attempt>('POST', '/speaking/attempts', {
    drillSlug: drill.slug,
    audioBase64: await speak('I sink there are sree sings'),
    mimeType: 'audio/wav',
    durationMs: 3200,
  });
  report(wrong);

  console.log('\n5. ÂM HAY SAI (tích luỹ qua ba lần trên)');
  const issues = await call<{ phoneme: string; labelVi: string; errorCount: number; totalCount: number }[]>(
    'GET',
    '/speaking/issues',
  );
  for (const issue of issues.slice(0, 5)) {
    console.log(`   ${issue.phoneme.padEnd(16)} sai ${issue.errorCount}/${issue.totalCount} — ${issue.labelVi}`);
  }

  const weak = await call<{ slug: string; focusLabelVi: string }[]>(
    'GET',
    '/speaking/drills?weakOnly=true',
  );
  console.log(`   gợi ý ${weak.length} bài luyện đúng nhóm yếu: ${[...new Set(weak.map((d) => d.focusLabelVi))].join(', ')}`);

  // --- Role-play ------------------------------------------------------------
  console.log('\n6. HỘI THOẠI THEO TÌNH HUỐNG');
  const scenarios = await call<{ slug: string; titleVi: string; maxTurns: number; objectives: string[] }[]>(
    'GET',
    '/speaking/scenarios',
  );
  console.log(`   ${scenarios.length} tình huống`);
  const scenario = scenarios.find((entry) => entry.slug === 'ordering-at-a-cafe');
  console.log(`   chọn: "${scenario?.titleVi}" · ${scenario?.maxTurns} lượt · ${scenario?.objectives.length} mục tiêu`);

  let conversationId: string | undefined;
  const said = [
    'Hello, I want one coffee.',
    'Large please. And I want oat milk.',
    'Okay, normal milk is fine. How much it cost?',
  ];

  for (const message of said) {
    const state = await call<{
      conversationId: string;
      turns: { role: string; content: string; corrections?: { original: string; corrected: string; whyVi: string }[] }[];
      turnsUsed: number;
      maxTurns: number;
      finished: boolean;
      objectivesMet: string[];
    }>('POST', '/speaking/roleplay', { scenarioSlug: 'ordering-at-a-cafe', conversationId, message });
    conversationId = state.conversationId;

    const reply = state.turns.at(-1);
    const corrections = reply?.corrections ?? [];
    console.log(`\n   Bạn : ${message}`);
    console.log(`   Quán: ${reply?.content}`);
    if (corrections.length > 0) {
      for (const correction of corrections) {
        console.log(`   sửa : "${correction.original}" → "${correction.corrected}" · ${correction.whyVi.slice(0, 80)}`);
      }
    }
    console.log(`   lượt ${state.turnsUsed}/${state.maxTurns} · đạt ${state.objectivesMet.length} mục tiêu`);
  }

  console.log('\n7. HỆ QUẢ');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const [attempts, score, usage] = await Promise.all([
    prisma.speakingAttempt.count({ where: { userId: user.id } }),
    prisma.skillScore.findFirst({ where: { userId: user.id, skill: 'SPEAKING' } }),
    prisma.aiUsageLog.findMany({ where: { userId: user.id } }),
  ]);
  console.log(`   SpeakingAttempt: ${attempts} lượt`);
  console.log(`   SkillScore SPEAKING: ${Math.round(score?.score ?? 0)}/100`);
  console.log(`   AiUsageLog: ${usage.length} lượt gọi (${usage.filter((u) => u.feature === 'speaking').length} nhận dạng, ${usage.filter((u) => u.feature === 'roleplay').length} hội thoại)`);

  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

function report(attempt: Attempt): void {
  console.log(`   nghe được : "${attempt.transcript}"`);
  console.log(
    `   điểm      : ${attempt.scores.overall}/100 (${attempt.bandLabelVi}) · chính xác ${attempt.scores.accuracy} · trôi chảy ${attempt.scores.fluency} · đủ ý ${attempt.scores.completeness} · ngữ điệu ${attempt.scores.prosody ?? 'không đo'}`,
  );
  console.log(`   tốc độ    : ${attempt.wpm} từ/phút (chuẩn ${attempt.targetWpm.min}–${attempt.targetWpm.max})`);
  const bad = attempt.words.filter((word) => word.color !== 'green');
  console.log(
    `   từng từ   : ${attempt.words.map((w) => `${w.word}${w.color === 'green' ? '' : w.color === 'amber' ? '?' : '✗'}`).join(' ')}`,
  );
  if (bad.length > 0) {
    console.log(`   có vấn đề : ${bad.map((w) => `${w.word}(${w.score}, ${w.errorType})`).join(', ')}`);
  }
  console.log(`   nhận xét  : ${attempt.feedbackVi}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
