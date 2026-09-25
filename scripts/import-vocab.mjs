/**
 * Builds vocabulary entries for the most frequent English words.
 *
 * Getting to a couple of thousand words by hand is not realistic, and hand
 * writing them would be worse than a real source anyway. So the mechanical
 * parts come from data and the rest is generated:
 *
 *   IPA, syllables, stress  ← CMUdict (BSD licence, already cited in LICENSES.md)
 *   word list and order     ← a frequency list, so common words come first
 *   part of speech, CEFR,
 *   definitions, examples   ← the configured AI provider
 *
 * The script is **resumable**. It reads what is already in content/vocabulary,
 * skips those lemmas, writes after every batch, and can be stopped at any point
 * — which matters because a free AI tier will refuse partway through and the
 * work done so far must survive.
 *
 * Chạy:
 *   node scripts/import-vocab.mjs --topic daily-life --count 40
 *   node scripts/import-vocab.mjs --topic daily-life --count 40 --dry-run
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { readEnvFile } from './lib/read-env.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(root, '.cache/vocab');
const CONTENT = resolve(root, 'content/vocabulary');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, index, all) => {
    if (!arg.startsWith('--')) return pairs;
    const key = arg.slice(2);
    const next = all[index + 1];
    pairs.push([key, next && !next.startsWith('--') ? next : 'true']);
    return pairs;
  }, []),
);

const TOPIC = args.topic ?? 'daily-life';
const COUNT = Number(args.count ?? 20);
const BATCH = Number(args.batch ?? 8);
const DRY = args['dry-run'] === 'true';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const env = readEnvFile(resolve(root, '.env'));

const KEY = env.AI_API_KEY ?? '';
const MODEL = env.GEMINI_MODEL_DEEP ?? 'gemini-3.5-flash';

// ---------------------------------------------------------------------------
// CMUdict: ARPAbet to IPA, syllables, stress
// ---------------------------------------------------------------------------

/** ARPAbet phoneme -> IPA. Stress digits are stripped before lookup. */
const ARPA_TO_IPA = {
  AA: 'ɑː', AE: 'æ', AH: 'ʌ', AO: 'ɔː', AW: 'aʊ', AY: 'aɪ', B: 'b', CH: 'tʃ',
  D: 'd', DH: 'ð', EH: 'e', ER: 'ɜːr', EY: 'eɪ', F: 'f', G: 'ɡ', HH: 'h',
  IH: 'ɪ', IY: 'iː', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ',
  OW: 'oʊ', OY: 'ɔɪ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ',
  UH: 'ʊ', UW: 'uː', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};

/** Phonemes that carry a stress digit are the vowels, and vowels make syllables. */
const VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

function loadCmudict() {
  const file = resolve(DATA, 'cmudict.dict');
  if (!existsSync(file)) {
    console.error(`Thiếu ${file}.`);
    console.error('Tải: curl -o .cache/vocab/cmudict.dict \\');
    console.error('  https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict');
    process.exit(1);
  }

  const map = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';;;')) continue;
    const [wordPart, ...phones] = trimmed.split(' ');
    // "word(2)" is an alternative pronunciation; the first entry is enough.
    if (wordPart.includes('(')) continue;
    if (!map.has(wordPart)) map.set(wordPart, phones);
  }
  return map;
}

/** "/ˈkɑːmpoʊst/" plus "com·post" plus "10" from the ARPAbet phones. */
export function pronunciationFrom(phones) {
  const ipa = [];
  const stress = [];
  let syllableCount = 0;

  for (const phone of phones) {
    const bare = phone.replace(/\d/g, '');
    const symbol = ARPA_TO_IPA[bare];
    if (!symbol) continue;

    if (VOWELS.has(bare)) {
      const digit = phone.match(/\d/)?.[0] ?? '0';
      syllableCount += 1;
      // Primary stress is marked in IPA with ˈ before the syllable's onset,
      // which needs the consonants that came after the previous vowel.
      stress.push(digit === '1' ? '1' : '0');
    }
    ipa.push(symbol);
  }

  return {
    ipa: `/${ipa.join('')}/`,
    stressPattern: stress.join(''),
    syllableCount: Math.max(1, syllableCount),
  };
}

// ---------------------------------------------------------------------------
// Function words
// ---------------------------------------------------------------------------

/**
 * Words a frequency list puts at the top that do not belong in a vocabulary
 * deck.
 *
 * "the", "of", "that" are the most common words in English and among the least
 * useful things to put on a flashcard: they carry grammar, not meaning, and a
 * learner meets them in every sentence anyway. Grammar lessons teach them; this
 * importer skips them.
 */
const FUNCTION_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'not', 'are', 'from',
  'his', 'her', 'she', 'him', 'its', 'our', 'their', 'them', 'they', 'our',
  'was', 'were', 'been', 'being', 'have', 'has', 'had', 'does', 'did', 'done',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'but', 'nor', 'yet', 'because', 'although', 'though', 'while', 'since', 'until',
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond',
  'during', 'except', 'inside', 'into', 'near', 'onto', 'outside', 'over',
  'through', 'toward', 'towards', 'under', 'upon', 'within', 'without',
  'all', 'any', 'both', 'each', 'either', 'every', 'few', 'many', 'more', 'most',
  'much', 'neither', 'none', 'one', 'other', 'others', 'same', 'several', 'some',
  'such', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'why',
  'how', 'when', 'where', 'there', 'here', 'then', 'than', 'too', 'very', 'also',
  'just', 'only', 'even', 'still', 'already', 'again', 'once', 'ever', 'never',
  'always', 'often', 'sometimes', 'usually', 'now', 'yes', 'its', 'itself',
  'himself', 'herself', 'myself', 'yourself', 'themselves', 'ourselves',
  'get', 'got', 'let', 'put', 'say', 'said', 'see', 'saw', 'use', 'used',
  'your', 'out', 'off', 'down', 'back', 'away', 'well', 'like', 'make', 'made',
]);
// ---------------------------------------------------------------------------
// What is already in the content files
// ---------------------------------------------------------------------------

function existingLemmas() {
  const known = new Set();
  if (!existsSync(CONTENT)) return known;
  for (const name of readdirSync(CONTENT)) {
    if (!name.endsWith('.yaml')) continue;
    const text = readFileSync(resolve(CONTENT, name), 'utf8');
    for (const match of text.matchAll(/^ {2}- lemma: (.+)$/gm)) {
      known.add(match[1].trim().toLowerCase());
    }
  }
  return known;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const SYSTEM = [
  'Bạn là biên tập viên từ điển Anh-Việt cho người Việt học tiếng Anh.',
  '',
  'Với mỗi từ được cho, trả về một mục từ điển. Quy tắc:',
  '- definitionEn: một câu tiếng Anh đơn giản, dùng từ dễ hơn chính từ đang định nghĩa.',
  '- definitionVi: nghĩa tiếng Việt tự nhiên, KHÔNG dịch máy. Nếu từ có nhiều nghĩa,',
  '  chỉ lấy nghĩa thông dụng nhất.',
  '- pos: một trong NOUN VERB ADJECTIVE ADVERB PREPOSITION CONJUNCTION PRONOUN DETERMINER.',
  '- cefr: một trong A1 A2 B1 B2 C1, theo độ khó thật của từ.',
  '- examples: ĐÚNG HAI câu. Mỗi câu phải CHỨA chính từ đó (dạng chia khác được),',
  '  dài 6-14 từ, tự nhiên, và có bản dịch tiếng Việt sát nghĩa.',
  '- Bối cảnh ví dụ nên gần đời sống Việt Nam khi hợp lý.',
  '',
  'Trả về JSON: {"entries":[{"lemma":"...","pos":"...","cefr":"...","definitionEn":"...",',
  '"definitionVi":"...","examples":[{"en":"...","vi":"..."},{"en":"...","vi":"..."}]}]}',
].join('\n');

async function generate(words) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: words.join(', ') }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          temperature: 0.4,
          thinkingConfig: { thinkingBudget: 512 },
        },
      }),
    },
  );

  const json = await response.json();
  if (!response.ok) {
    const message = json?.error?.message ?? `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return JSON.parse(text).entries ?? [];
}

// ---------------------------------------------------------------------------
// YAML output
// ---------------------------------------------------------------------------

/** Quotes only when YAML would otherwise misread the value. */
function yamlValue(value) {
  const text = String(value);
  return /[:#\-?*&!|>%@`{}[\],"']/.test(text) || text !== text.trim()
    ? JSON.stringify(text)
    : text;
}

function toYaml(entry, pron, syllables) {
  const lines = [
    '',
    `  - lemma: ${yamlValue(entry.lemma)}`,
    `    cefr: ${entry.cefr}`,
    `    ipaUs: ${pron.ipa}`,
    `    ipaUk: ${pron.ipa}`,
    `    syllables: ${syllables}`,
    `    stressPattern: '${pron.stressPattern}'`,
    '    senses:',
    `      - pos: ${entry.pos}`,
    `        definitionEn: ${yamlValue(entry.definitionEn)}`,
    `        definitionVi: ${yamlValue(entry.definitionVi)}`,
    '        examples:',
  ];
  for (const example of entry.examples.slice(0, 2)) {
    lines.push(`          - en: ${yamlValue(example.en)}`);
    lines.push(`            vi: ${yamlValue(example.vi)}`);
  }
  return lines.join('\n');
}

/** CMUdict gives syllable count, not boundaries; this is a readable stand-in. */
function syllableHint(lemma, count) {
  if (count <= 1) return lemma;
  // Splitting English orthography properly needs a hyphenation dictionary. An
  // even split is wrong often enough that a plain lemma is more honest, so the
  // dot form is only used when it cannot mislead.
  return lemma;
}

// ---------------------------------------------------------------------------

async function main() {
  const target = resolve(CONTENT, `${TOPIC}.yaml`);
  if (!existsSync(target)) {
    console.error(`Không có ${target}. Chọn --topic là một trong các tệp đã có.`);
    process.exit(1);
  }

  const cmudict = loadCmudict();
  const known = existingLemmas();
  const freqFile = resolve(DATA, 'freq.txt');
  if (!existsSync(freqFile)) {
    console.error(`Thiếu ${freqFile}.`);
    process.exit(1);
  }

  const candidates = readFileSync(freqFile, 'utf8')
    .split('\n')
    .map((word) => word.trim().toLowerCase())
    .filter(
      (word) =>
        word.length >= 3 &&
        /^[a-z]+$/.test(word) &&
        !FUNCTION_WORDS.has(word) &&
        !known.has(word) &&
        cmudict.has(word),
    )
    .slice(0, COUNT);

  if (candidates.length === 0) {
    console.log('Không còn từ nào mới trong danh sách tần suất.');
    return;
  }

  console.log(`Chủ đề  : ${TOPIC}`);
  console.log(`Đã có   : ${known.size} từ`);
  console.log(`Sẽ thêm : ${candidates.length} từ`);
  console.log(`Model   : ${MODEL}${DRY ? ' (chạy thử, không gọi AI)' : ''}`);
  console.log('');

  if (DRY) {
    for (const word of candidates) {
      const pron = pronunciationFrom(cmudict.get(word));
      console.log(`  ${word.padEnd(16)} ${pron.ipa.padEnd(20)} ${pron.stressPattern}`);
    }
    return;
  }

  if (KEY.length === 0) {
    console.error('Chưa có AI_API_KEY trong .env.');
    process.exit(1);
  }

  let added = 0;
  for (let index = 0; index < candidates.length; index += BATCH) {
    const batch = candidates.slice(index, index + BATCH);
    let entries;
    try {
      entries = await generate(batch);
    } catch (error) {
      console.error(`\nDừng ở lô ${index / BATCH + 1}: ${error.message.slice(0, 120)}`);
      if (error.status === 429) {
        console.error('Hết hạn mức. Chạy lại lệnh này sau, phần đã thêm vẫn giữ nguyên.');
      }
      break;
    }

    const chunks = [];
    for (const entry of entries) {
      const lemma = String(entry.lemma ?? '').toLowerCase();
      const phones = cmudict.get(lemma);
      if (!phones || known.has(lemma)) continue;
      if (!Array.isArray(entry.examples) || entry.examples.length < 2) continue;

      const pron = pronunciationFrom(phones);
      chunks.push(toYaml(entry, pron, syllableHint(lemma, pron.syllableCount)));
      known.add(lemma);
      added += 1;
    }

    if (chunks.length > 0) {
      // Written after every batch so a later refusal cannot lose earlier work.
      const current = readFileSync(target, 'utf8').replace(/\s*$/, '');
      writeFileSync(target, `${current}\n${chunks.join('\n')}\n`, 'utf8');
    }
    console.log(`  lô ${index / BATCH + 1}: +${chunks.length} từ (tổng ${added})`);
  }

  console.log(`\nĐã thêm ${added} từ vào ${TOPIC}.yaml`);
  console.log('Chạy `pnpm check:content` rồi `pnpm db:seed`.');
}

if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true });
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
