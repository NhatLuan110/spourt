/**
 * Kiểm tra xem nhận dạng giọng nói có phiên âm ĐÚNG NHỮNG GÌ NGHE ĐƯỢC hay tự
 * sửa lỗi phát âm giúp người học.
 *
 * Vì sao cần: model nhận dạng được huấn luyện để ra văn bản trôi chảy, nên mặc
 * định nó nghe Ý ĐỊNH chứ không nghe ÂM THANH. Với chấm phát âm thì đó là hỏng:
 * người học đọc "I sink" mà máy ghi "I think" thì lỗi biến mất (D-051).
 *
 * Chạy: node scripts/check-stt-literal.mjs
 * Tốn hạn mức AI. Chỉ chạy khi cần kiểm chứng lại.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return at < 0 ? [line, ''] : [line.slice(0, at), line.slice(at + 1)];
    }),
);

const KEY = env.AI_API_KEY ?? '';
const TTS = env.GEMINI_MODEL_TTS ?? 'gemini-2.5-flash-preview-tts';
const STT = env.GEMINI_MODEL_STT ?? 'gemini-3.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Những cách đọc sai điển hình của người Việt (§7.6.3), viết lại bằng chính tả
 * để TTS phát ra đúng âm sai đó.
 */
const CASES = [
  { intended: 'I think there are three things', mispronounced: 'I sink there are sree sings', error: 'th → s' },
  { intended: 'Every visitor loves the view', mispronounced: 'Every yisitor loves the yew', error: 'v → y' },
  { intended: 'The cat sat on the mat', mispronounced: 'The ca sa on the ma', error: 'mất phụ âm cuối' },
  { intended: 'She should share the fish', mispronounced: 'See sood sare the fiss', error: 'sh → s' },
];

async function post(model, body) {
  const response = await fetch(`${BASE}/models/${model}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Đúng prompt mà GeminiProvider.transcribe đang dùng. */
function instructionFor(expected) {
  return [
    'You are a phonetic transcriber, not a helpful assistant.',
    `The speaker was asked to say: "${expected}"`,
    'Write down the sounds you ACTUALLY hear, spelled as English words.',
    'If they said "sink", write sink — even though "think" was intended.',
    'If they said "sree", write sree. Invent a spelling when no word fits.',
    'Never repair, normalise, or guess the intended word.',
    'Reply with the transcription only, no punctuation.',
  ].join('\n');
}

let literal = 0;
let repaired = 0;

for (const testCase of CASES) {
  const tts = await post(TTS, {
    contents: [{ parts: [{ text: `Say clearly: ${testCase.mispronounced}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });

  if (tts.status !== 200) {
    console.log(`BỎ QUA ${testCase.error}: TTS lỗi ${tts.status} ${tts.json?.error?.message?.slice(0, 80)}`);
    continue;
  }

  const inline = tts.json.candidates[0].content.parts.find((part) => part.inlineData).inlineData;
  const wav = pcmToWav(Buffer.from(inline.data, 'base64'));

  const stt = await post(STT, {
    contents: [
      {
        parts: [
          { text: instructionFor(testCase.intended) },
          { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 512, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  });

  if (stt.status !== 200) {
    console.log(`BỎ QUA ${testCase.error}: STT lỗi ${stt.status} ${stt.json?.error?.message?.slice(0, 80)}`);
    continue;
  }

  const heard = (stt.json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  const normalise = (text) => text.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const wasRepaired = normalise(heard) === normalise(testCase.intended);
  if (wasRepaired) repaired += 1;
  else literal += 1;

  console.log(`\n${testCase.error}`);
  console.log(`  đọc ra   : ${testCase.mispronounced}`);
  console.log(`  nghe được: ${heard}`);
  console.log(`  kết quả  : ${wasRepaired ? 'BỊ SỬA — lỗi phát âm biến mất' : 'giữ nguyên âm sai — tốt'}`);
}

console.log(`\nGiữ nguyên ${literal}/${literal + repaired}, bị sửa ${repaired}/${literal + repaired}.`);
console.log(
  repaired === 0
    ? 'Nhận dạng phiên âm trung thực. Chấm phát âm bắt được lỗi thay âm.'
    : 'Nhận dạng vẫn tự sửa. Chấm phát âm chỉ bắt được nuốt từ và tốc độ, không bắt được lỗi thay âm (D-051).',
);
process.exitCode = 0;
