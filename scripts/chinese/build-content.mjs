/**
 * Dựng kho nội dung tiếng Trung cho ngăn Chinese từ các bộ dữ liệu mở.
 *
 * Nguồn (tải sẵn về `.cache/chinese-src/`, xem scripts/chinese/fetch-sources.mjs):
 *   - hsk-complete.json  — complete-hsk-vocabulary (MIT). HSK 2.0 nằm ở level `old-1..old-6`.
 *   - vietphrase.txt     — VietPhrase, nghĩa tiếng Việt theo từ.
 *   - thieuchuu.txt      — Từ điển Thiều Chửu, nghĩa tiếng Việt theo chữ.
 *   - hanviet.csv        — âm Hán Việt, đánh khoá theo chữ PHỒN THỂ + pinyin có số thanh.
 *   - package/*.json     — hanzi-writer-data (Arphic Public License), nét bút từng chữ.
 *
 * Đầu ra:
 *   - content/chinese/hsk1.yaml … hsk6.yaml   — 4991 từ HSK 2.0
 *   - content/chinese/hanzi.yaml              — 2632 chữ Hán xuất hiện trong các từ đó
 *   - apps/web/public/hanzi-data/<chữ>.json   — nét bút, chỉ chép những chữ thực sự dùng
 *
 * Chạy: node scripts/chinese/build-content.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SRC = resolve(ROOT, '.cache/chinese-src');
const STROKE_SRC = resolve(SRC, 'package');
const CONTENT_OUT = resolve(ROOT, 'content/chinese');
const STROKE_OUT = resolve(ROOT, 'apps/web/public/hanzi-data');

/** Nghĩa do người soạn chèn tay, đè lên nghĩa máy lấy từ từ điển. */
const OVERRIDES = JSON.parse(readFileSync(resolve(import.meta.dirname, 'overrides.json'), 'utf8'));

const HAN = /\p{Script=Han}/u;

/**
 * CC-CEDICT mở đầu các âm đọc phụ bằng những cụm này. `forms[0]` của bộ HSK vì
 * thế hay là âm hiếm — 个 ra `gě`, 都 ra `Dū`, 上 ra `shǎng` — nên phải bỏ qua
 * chúng để lấy đúng âm người học cần.
 */
const SECONDARY_READING = /^(used in|variant of|old variant of|surname|abbr\. for|see |erhua variant)/i;

function must(path) {
  if (!existsSync(path)) {
    throw new Error(`Thiếu nguồn ${path} — chạy "node scripts/chinese/fetch-sources.mjs" trước.`);
  }
  return path;
}

/** `词=nghĩa 1/nghĩa 2/…` → Map<词, chuỗi vế phải>. */
function readSlashDict(path) {
  const map = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const at = line.indexOf('=');
    if (at < 1) continue;
    map.set(line.slice(0, at).replace(/^﻿/, ''), line.slice(at + 1));
  }
  return map;
}

/**
 * Thiều Chửu ghi cả mục từ trên một dòng, phần định nghĩa ngăn bằng chuỗi `\n\t1. `
 * viết dạng ký tự chứ không phải xuống dòng thật. Lấy nghĩa đầu, bỏ chữ Hán chú thích.
 */
function thieuChuuGloss(raw) {
  for (const item of raw.split('\\n\\t').slice(1)) {
    const text = item
      .replace(/^\d+\.\s*/, '')
      .replace(/\s*Như\s.*$/u, '')
      .replace(/[\p{Script=Han}]+/gu, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[,.\s]+$/u, '')
      .trim();
    if (text.length >= 2) return text.toLowerCase();
  }
  return null;
}

/** Chuẩn hoá khoá pinyin: bỏ hoa, thanh nhẹ ghi `*` bên CSV đổi thành `5`. */
function pinyinKey(value) {
  return value.toLowerCase().replace(/\*$/, '5');
}

function main() {
  mkdirSync(CONTENT_OUT, { recursive: true });
  mkdirSync(STROKE_OUT, { recursive: true });

  const hsk = JSON.parse(readFileSync(must(resolve(SRC, 'hsk-complete.json')), 'utf8'));
  const vietphrase = readSlashDict(must(resolve(SRC, 'vietphrase.txt')));
  const thieuchuu = readSlashDict(must(resolve(SRC, 'thieuchuu.txt')));

  // ---- âm Hán Việt ---------------------------------------------------------
  // hanviet.csv: 好,['hảo'],hao3 — một chữ nhiều âm, phân biệt bằng số thanh, nên
  // khoá phải giữ nguyên số. Bỏ số đi thì 好 hao3 "hảo" bị hao4 "hiếu" đè mất.
  const byTone = new Map(); // char -> Map<'hao3', 'hảo'>
  const bySyllable = new Map(); // char -> Map<'hao', 'hảo'>  (dự phòng khi lệch thanh)
  const anyReading = new Map(); // char -> âm đầu tiên gặp
  for (const line of readFileSync(must(resolve(SRC, 'hanviet.csv')), 'utf8').split(/\r?\n/).slice(1)) {
    const match = /^(.),(\[.*\]|"\[.*\]"),(\S*)$/u.exec(line);
    if (!match) continue;
    const [, char, rawReadings, rawPinyin] = match;
    const reading = /'([^']+)'/.exec(rawReadings)?.[1];
    if (!reading) continue;
    const tone = pinyinKey(rawPinyin);
    const syllable = tone.replace(/\d$/, '');
    if (!byTone.has(char)) byTone.set(char, new Map());
    if (!bySyllable.has(char)) bySyllable.set(char, new Map());
    if (!byTone.get(char).has(tone)) byTone.get(char).set(tone, reading);
    if (!bySyllable.get(char).has(syllable)) bySyllable.get(char).set(syllable, reading);
    if (!anyReading.has(char)) anyReading.set(char, reading);
  }

  /**
   * Bảng tra chữ giản thể sang phồn thể, dựng từ chính bộ HSK. Cần vì hanviet.csv
   * chỉ có chữ phồn thể: tra 这 trượt, phải tra 這 mới ra "giá".
   *
   * Một chữ giản thể ứng với nhiều dạng phồn thể, trong đó có cả biến thể hiếm —
   * 词 vừa ra 詞 vừa ra 䛐 — nên xếp theo số lần xuất hiện, dạng phổ biến đứng trước.
   */
  const traditionalTally = new Map();
  for (const entry of hsk) {
    for (const form of entry.forms ?? []) {
      const simplified = [...entry.simplified];
      const traditional = [...(form.traditional ?? '')];
      if (simplified.length !== traditional.length) continue;
      for (let i = 0; i < simplified.length; i += 1) {
        if (simplified[i] === traditional[i]) continue;
        if (!traditionalTally.has(simplified[i])) traditionalTally.set(simplified[i], new Map());
        const counts = traditionalTally.get(simplified[i]);
        counts.set(traditional[i], (counts.get(traditional[i]) ?? 0) + 1);
      }
    }
  }
  const toTraditional = new Map(
    [...traditionalTally].map(([simplified, counts]) => [
      simplified,
      [...counts].sort((a, b) => b[1] - a[1]).map(([char]) => char),
    ]),
  );

  /** Âm Hán Việt của một chữ, thử cả dạng giản thể lẫn mọi dạng phồn thể đã biết. */
  function charHanViet(char, tone) {
    for (const candidate of [char, ...(toTraditional.get(char) ?? [])]) {
      if (!candidate) continue;
      const exact = tone && byTone.get(candidate)?.get(tone);
      if (exact) return exact;
      const loose = tone && bySyllable.get(candidate)?.get(tone.replace(/\d$/, ''));
      if (loose) return loose;
      const fallback = anyReading.get(candidate);
      if (fallback) return fallback;
    }
    return null;
  }

  /** Ghép âm Hán Việt cả từ theo từng âm tiết. */
  function hanVietOf(simplified, numeric) {
    const tones = (numeric ?? '').split(/\s+/).filter(Boolean).map(pinyinKey);
    const chars = [...simplified].filter((c) => HAN.test(c));
    const parts = chars.map((char, index) => charHanViet(char, tones[index] ?? null));
    return parts.length > 0 && parts.every(Boolean) ? parts.join(' ') : null;
  }

  /** Nghĩa tiếng Việt: ưu tiên bản chèn tay, rồi VietPhrase, rồi Thiều Chửu. */
  function meaningViOf(simplified, hanViet) {
    if (OVERRIDES[simplified]) return OVERRIDES[simplified];

    const fromPhrase = vietphrase.get(simplified);
    if (fromPhrase) {
      const glosses = fromPhrase
        .split('/')
        .map((gloss) => gloss.trim().toLowerCase())
        .filter(Boolean)
        .filter((gloss, index, all) => all.indexOf(gloss) === index);
      // Âm Hán Việt đã có cột riêng, để lẫn trong nghĩa thì đẩy nghĩa thật xuống
      // sau ("是 = là; thị; đúng"). Bỏ nó đi — trừ khi nó là gloss duy nhất, vì
      // với 安全 "an toàn" hay 政治 "chính trị" thì đó đúng là nghĩa tiếng Việt.
      const meaningful = glosses.filter((gloss) => gloss !== hanViet);
      const chosen = meaningful.length > 0 ? meaningful : glosses;
      if (chosen.length > 0) return chosen.slice(0, 4).join('; ');
    }

    const fromThieuChuu = thieuchuu.get(simplified);
    if (fromThieuChuu) return thieuChuuGloss(fromThieuChuu);
    return null;
  }

  /** Âm đọc chính: bỏ các mục CC-CEDICT đánh dấu là biến thể hoặc họ người. */
  function pickForm(forms) {
    const primary = forms.find((form) => !SECONDARY_READING.test((form.meanings ?? [])[0] ?? ''));
    return primary ?? forms[0];
  }

  // ---- duyệt từ vựng -------------------------------------------------------
  const levels = new Map([1, 2, 3, 4, 5, 6].map((level) => [level, []]));
  const charFirstLevel = new Map();
  const charTone = new Map();
  const missingMeaning = [];
  const missingHanViet = [];

  for (const entry of hsk) {
    const level = (entry.level ?? [])
      .filter((tag) => tag.startsWith('old-'))
      .map((tag) => Number(tag.slice(4)))
      .sort((a, b) => a - b)[0];
    if (!level || !entry.forms?.length) continue;

    const form = pickForm(entry.forms);
    const numeric = form.transcriptions?.numeric ?? null;
    const hanViet = hanVietOf(entry.simplified, numeric);
    const meaningVi = meaningViOf(entry.simplified, hanViet);
    if (!meaningVi) missingMeaning.push(`${entry.simplified} (HSK${level})`);
    if (!hanViet) missingHanViet.push(entry.simplified);

    levels.get(level).push({
      simplified: entry.simplified,
      traditional: form.traditional !== entry.simplified ? form.traditional : null,
      pinyin: form.transcriptions?.pinyin ?? null,
      pinyinNumeric: numeric,
      hanViet,
      meaningVi,
      meaningEn: (form.meanings ?? []).slice(0, 3).join('; ') || null,
      pos: entry.pos ?? [],
      frequencyRank: entry.frequency ?? null,
      radical: entry.radical ?? null,
      classifiers: form.classifiers ?? [],
    });

    // Chữ đơn ghi lại thanh điệu để tra đúng âm Hán Việt khi dựng hanzi.yaml.
    const tones = (numeric ?? '').split(/\s+/).filter(Boolean).map(pinyinKey);
    [...entry.simplified].forEach((char, index) => {
      if (!HAN.test(char)) return;
      if (!charFirstLevel.has(char) || charFirstLevel.get(char) > level) {
        charFirstLevel.set(char, level);
        if (tones[index]) charTone.set(char, tones[index]);
      } else if (!charTone.has(char) && tones[index]) {
        charTone.set(char, tones[index]);
      }
    });
  }

  // ---- content/chinese/hsk<N>.yaml -----------------------------------------
  let total = 0;
  for (const [level, words] of levels) {
    // Từ hay gặp học trước, giống cách kho tiếng Anh xếp theo frequencyRank.
    words.sort((a, b) => (a.frequencyRank ?? 1e9) - (b.frequencyRank ?? 1e9));
    total += words.length;
    const lines = [
      `# HSK ${level} — ${words.length} từ (HSK 2.0).`,
      '# Nguồn: complete-hsk-vocabulary (MIT), VietPhrase, Thiều Chửu, hanviet-pinyin-wordlist.',
      '# Tệp này do scripts/chinese/build-content.mjs sinh ra — sửa tay sẽ mất khi dựng lại.',
      '# Muốn đổi nghĩa tiếng Việt thì sửa scripts/chinese/overrides.json.',
      `hskLevel: ${level}`,
      'words:',
    ];
    for (const word of words) lines.push(...yamlWord(word));
    writeFileSync(resolve(CONTENT_OUT, `hsk${level}.yaml`), `${lines.join('\n')}\n`, 'utf8');
    console.log(`  hsk${level}.yaml  ${String(words.length).padStart(4)} từ`);
  }

  // ---- content/chinese/hanzi.yaml ------------------------------------------
  const characters = [];
  let withStrokes = 0;
  const ordered = [...charFirstLevel].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'zh'));
  for (const [char, level] of ordered) {
    const strokeFile = resolve(STROKE_SRC, `${char}.json`);
    let strokeCount = null;
    if (existsSync(strokeFile)) {
      strokeCount = JSON.parse(readFileSync(strokeFile, 'utf8')).strokes.length;
      copyFileSync(strokeFile, resolve(STROKE_OUT, `${char}.json`));
      withStrokes += 1;
    }
    const thieuChuuEntry = thieuchuu.get(char);
    characters.push({
      char,
      traditional: toTraditional.get(char)?.[0] ?? null,
      hskLevel: level,
      hanViet: charHanViet(char, charTone.get(char) ?? null),
      pinyin: charTone.get(char),
      strokeCount,
      meaningVi: OVERRIDES[char] ?? (thieuChuuEntry ? thieuChuuGloss(thieuChuuEntry) : null),
    });
  }

  const hanziLines = [
    `# ${characters.length} chữ Hán xuất hiện trong HSK 1-6, kèm số nét và âm Hán Việt.`,
    '# Nét bút nằm ở apps/web/public/hanzi-data/<chữ>.json (hanzi-writer-data, Arphic Public License).',
    '# Tệp này do scripts/chinese/build-content.mjs sinh ra.',
    'characters:',
  ];
  for (const character of characters) {
    hanziLines.push(`  - char: ${quote(character.char)}`);
    hanziLines.push(`    hskLevel: ${character.hskLevel}`);
    const put = (key, value) => {
      if (value) hanziLines.push(`    ${key}: ${quote(value)}`);
    };
    put('traditional', character.traditional);
    put('pinyinNumeric', character.pinyin);
    put('hanViet', character.hanViet);
    if (character.strokeCount) hanziLines.push(`    strokeCount: ${character.strokeCount}`);
    put('meaningVi', character.meaningVi);
  }
  writeFileSync(resolve(CONTENT_OUT, 'hanzi.yaml'), `${hanziLines.join('\n')}\n`, 'utf8');

  console.log(`  hanzi.yaml    ${characters.length} chữ, ${withStrokes} chữ có dữ liệu nét bút`);
  console.log(`\n${total} từ, ${characters.length} chữ.`);
  report('chưa có nghĩa tiếng Việt — thêm vào overrides.json', missingMeaning);
  report('chưa có âm Hán Việt', missingHanViet);
}

function report(label, items) {
  if (items.length === 0) return;
  console.log(`\n${items.length} từ ${label}:`);
  console.log(items.slice(0, 120).join(', '));
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function yamlWord(word) {
  const lines = [`  - simplified: ${quote(word.simplified)}`];
  const put = (key, value) => {
    if (value !== null && value !== undefined && value !== '') lines.push(`    ${key}: ${quote(value)}`);
  };
  put('traditional', word.traditional);
  put('pinyin', word.pinyin);
  put('pinyinNumeric', word.pinyinNumeric);
  put('hanViet', word.hanViet);
  put('meaningVi', word.meaningVi);
  put('meaningEn', word.meaningEn);
  if (word.pos.length > 0) lines.push(`    pos: [${word.pos.map(quote).join(', ')}]`);
  if (word.classifiers.length > 0) {
    lines.push(`    classifiers: [${word.classifiers.map(quote).join(', ')}]`);
  }
  if (word.frequencyRank !== null) lines.push(`    frequencyRank: ${word.frequencyRank}`);
  put('radical', word.radical);
  return lines;
}

main();
