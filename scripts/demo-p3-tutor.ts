/**
 * §13 P3 demo, phần Gia sư AI: hỏi và được trả lời có sửa lỗi.
 *
 * Chạy: pnpm --filter @sprout/api exec dotenv -e ../../.env -- tsx ../../scripts/demo-p3-tutor.ts
 * Tốn hạn mức AI thật.
 */
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:4000/api/v1';
const EMAIL = `p3tutor-${Date.now()}@sprout.local`;
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
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  return json.data;
}

interface Reply {
  conversationId: string;
  reply: { content: string; corrections: { original: string; corrected: string; whyVi: string }[] };
  quota: { used: number; limit: number; remaining: number; provider: string };
}

async function main(): Promise<void> {
  const registered = await call<{ accessToken: string }>('POST', '/auth/register', {
    email: EMAIL,
    password: 'demoP3tutor2026',
    displayName: 'Minh',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  token = registered.accessToken;

  const quota = await call<{ used: number; limit: number; available: boolean; provider: string }>(
    'GET',
    '/tutor/quota',
  );
  console.log(`Hạn mức: ${quota.used}/${quota.limit} · nhà cung cấp ${quota.provider} · sẵn sàng ${quota.available}`);

  // 1. Hỏi bằng tiếng Việt, không có lỗi tiếng Anh nào để sửa.
  console.log('\n1. HỎI THUẦN TIẾNG VIỆT');
  console.log('   "Khi nào dùng have been và khi nào dùng have gone?"');
  const first = await call<Reply>('POST', '/tutor/ask', {
    message: 'Khi nào dùng have been và khi nào dùng have gone?',
  });
  console.log(indent(first.reply.content));
  console.log(`   sửa lỗi: ${first.reply.corrections.length} (đúng — câu hỏi bằng tiếng Việt)`);

  // 2. Hỏi tiếp trong cùng cuộc trò chuyện, lần này viết tiếng Anh có lỗi.
  console.log('\n2. HỎI TIẾP, VIẾT TIẾNG ANH CÓ LỖI');
  const flawed = 'I have went to Japan last year. Is this sentence correct?';
  console.log(`   "${flawed}"`);
  const second = await call<Reply>('POST', '/tutor/ask', {
    conversationId: first.conversationId,
    message: flawed,
  });
  console.log(indent(second.reply.content));
  console.log(`   sửa lỗi (${second.reply.corrections.length}):`);
  for (const correction of second.reply.corrections) {
    console.log(`     "${correction.original}" → "${correction.corrected}"`);
    console.log(`        ${correction.whyVi.slice(0, 110)}`);
  }

  // 3. Hỏi kèm bối cảnh: không phải gõ lại câu.
  console.log('\n3. HỎI KÈM BỐI CẢNH (không gõ lại câu)');
  console.log('   "Tại sao câu này sai?" + ngữ cảnh bài học present-simple');
  const third = await call<Reply>('POST', '/tutor/ask', {
    conversationId: first.conversationId,
    message: 'Tại sao câu này sai?',
    context: {
      kind: 'exercise',
      ref: 'gr_present-simple_1',
      excerpt: 'She go to school every day.',
    },
  });
  console.log(indent(third.reply.content));

  // 4. Cuộc trò chuyện được lưu lại.
  console.log('\n4. LỊCH SỬ');
  const conversations = await call<
    { id: string; title: string; messageCount: number; preview: string }[]
  >('GET', '/tutor/conversations');
  console.log(`   ${conversations.length} cuộc trò chuyện`);
  console.log(`   tiêu đề tự đặt: "${conversations[0]?.title}"`);
  console.log(`   số lượt: ${conversations[0]?.messageCount}`);

  const detail = await call<{ messages: { role: string; content: string }[] }>(
    'GET',
    `/tutor/conversations/${first.conversationId}`,
  );
  console.log(`   đọc lại đủ ${detail.messages.length} tin nhắn (3 hỏi + 3 đáp)`);

  console.log('\n5. HỆ QUẢ');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const [usage, mistakes] = await Promise.all([
    prisma.aiUsageLog.findMany({ where: { userId: user.id, feature: 'tutor' } }),
    prisma.mistakeLog.count({ where: { userId: user.id, category: 'tutor-correction' } }),
  ]);
  const tokensIn = usage.reduce((sum, row) => sum + row.tokensIn, 0);
  const tokensOut = usage.reduce((sum, row) => sum + row.tokensOut, 0);
  console.log(`   AiUsageLog: ${usage.length} lượt · ${tokensIn} token vào, ${tokensOut} ra`);
  console.log(`   MistakeLog: ${mistakes} lỗi từ gia sư ghi vào sổ`);
  console.log(`   hạn mức còn: ${third.quota.remaining}/${third.quota.limit}`);

  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

function indent(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(0, 8)
    .map((line) => `   ${line.trim()}`)
    .join('\n');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
