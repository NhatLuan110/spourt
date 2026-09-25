/**
 * Kiểm tra khoá AI trong .env mà không phải gửi khoá đi đâu cả.
 *
 * Chạy:  pnpm check:ai
 *
 * Báo rõ nhà cung cấp nào đang dùng, khoá còn sống không, và những khả năng
 * nào (chữ, đọc) thực sự gọi được — thay vì để lỗi lộ ra lúc đang học.
 */
import { existsSync } from 'node:fs';
import { readEnvFile } from './lib/read-env.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

/** Thoát bằng exitCode chứ không phải process.exit: fetch còn giữ socket mở, và
 *  thoát ngay lập tức làm libuv báo lỗi khẳng định trên Windows. */
function finish(ok) {
  console.log('');
  console.log(ok ? 'Sẵn sàng.' : 'Chưa dùng được tính năng AI.');
  process.exitCode = ok ? 0 : 1;
}

if (!existsSync(envPath)) {
  console.log('Không tìm thấy .env. Chạy: cp .env.example .env');
  finish(false);
} else {
  await main();
}

async function main() {
  const env = readEnvFile(resolve(root, '.env'));

  const provider = env.AI_PROVIDER ?? 'gemini';
  const speechProvider = env.AI_SPEECH_PROVIDER ?? (provider === 'gemini' ? 'gemini' : 'none');
  const speechKey = env.AI_SPEECH_API_KEY || (provider === 'gemini' ? env.AI_API_KEY : '') || '';
  const key = env.AI_API_KEY || env.ANTHROPIC_API_KEY || '';

  console.log(`Chữ          : ${provider}`);
  console.log(
    `Giọng nói    : ${speechProvider}${
      speechProvider !== 'none' && speechKey.length === 0 ? ' (CHƯA CÓ KHOÁ)' : ''
    }`,
  );

  if (provider === 'ollama') {
    console.log('Khoá         : không cần (Ollama chạy trên máy bạn)');
  } else if (key.length === 0) {
    console.log('Khoá         : CHƯA CÓ');
    console.log('');
    console.log('Thêm vào .env dòng:  AI_API_KEY=khoá-của-bạn');
    console.log('Lấy khoá Gemini miễn phí ở: https://aistudio.google.com/api-keys');
    finish(false);
    return;
  } else {
    // Chỉ in đầu và cuối, đủ để bạn nhận ra khoá nào mà không lộ khoá.
    console.log(`Khoá         : ${key.slice(0, 10)}…${key.slice(-4)} (${key.length} ký tự)`);
  }

  if (provider !== 'gemini') {
    console.log('');
    console.log(`Kiểm tra tự động mới hỗ trợ Gemini. Với ${provider}, chạy thử bằng chính app.`);
    process.exitCode = 0;
    return;
  }

  const BASE = 'https://generativelanguage.googleapis.com/v1beta';

  async function post(model, body) {
    try {
      const response = await fetch(`${BASE}/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: await response.json() };
    } catch (error) {
      return { status: 0, json: { error: { message: String(error) } } };
    }
  }

  function report(label, status, json) {
    const message = json?.error?.message ?? `HTTP ${status}`;
    console.log(`${label}: HỎNG (${status}) — ${message.slice(0, 110)}`);
  }

  let ok = true;

  // 1. Sinh chữ — thứ duy nhất bắt buộc phải chạy được.
  {
    const model = env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash';
    const { status, json } = await post(model, {
      contents: [{ parts: [{ text: 'Reply with exactly one word: ok' }] }],
      generationConfig: { maxOutputTokens: 20, thinkingConfig: { thinkingBudget: 0 } },
    });

    if (status === 200) {
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      console.log(`Sinh chữ     : OK (${model}) → "${text}"`);
    } else {
      ok = false;
      report('Sinh chữ     ', status, json);
      if (status === 401 || status === 403) {
        console.log('               → Khoá sai hoặc đã bị xoá. Tạo khoá mới rồi dán lại vào .env.');
      } else if (status === 429) {
        console.log('               → Hết hạn mức miễn phí hôm nay. Khoá vẫn đúng, mai thử lại.');
      } else if (status === 404) {
        console.log(`               → Model "${model}" không còn dùng được. Đổi GEMINI_MODEL_FAST trong .env.`);
      } else if (status === 0) {
        console.log('               → Không ra được mạng.');
      }
    }
  }

  // 2. Đọc thành tiếng — thiếu thì app lùi về giọng trình duyệt, không chặn.
  if (ok) {
    const model = env.GEMINI_MODEL_TTS ?? 'gemini-2.5-flash-preview-tts';
    const { status, json } = await post(model, {
      contents: [{ parts: [{ text: 'Say clearly: hello' }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    });

    if (status === 200) {
      const inline = json.candidates?.[0]?.content?.parts?.find(
        (part) => part.inlineData,
      )?.inlineData;
      const bytes = inline ? Buffer.from(inline.data, 'base64').length : 0;
      console.log(`Đọc (TTS)    : OK (${model}) → ${(bytes / 1024).toFixed(0)} KB audio`);
    } else {
      report('Đọc (TTS)    ', status, json);
      console.log('               → Không chặn: app lùi về giọng đọc của trình duyệt.');
    }
  }

  finish(ok);
}
