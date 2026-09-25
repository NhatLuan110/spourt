import type { CefrLevel } from '@sprout/shared';

/** §9.3 — the four Azure sub-scores plus the weighted total. */
export interface PronunciationScores {
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number;
}

export interface PhonemeScore {
  phoneme: string;
  score: number;
}

export interface WordScore {
  word: string;
  score: number;
  /** "None" | "Omission" | "Insertion" | "Mispronunciation" */
  errorType?: string;
  phonemes?: PhonemeScore[];
}

export const SCORE_WEIGHTS = {
  accuracy: 0.45,
  fluency: 0.25,
  completeness: 0.15,
  prosody: 0.15,
} as const;

export function overallScore(scores: PronunciationScores): number {
  const total =
    SCORE_WEIGHTS.accuracy * scores.accuracy +
    SCORE_WEIGHTS.fluency * scores.fluency +
    SCORE_WEIGHTS.completeness * scores.completeness +
    SCORE_WEIGHTS.prosody * scores.prosody;
  return Number(Math.max(0, Math.min(100, total)).toFixed(1));
}

export type ScoreBand = 'excellent' | 'good' | 'fair' | 'needs-work';

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'fair';
  return 'needs-work';
}

export const SCORE_BAND_LABEL_VI: Record<ScoreBand, string> = {
  excellent: 'Xuất sắc',
  good: 'Tốt',
  fair: 'Tạm được',
  'needs-work': 'Cần luyện thêm',
};

/** §7.6.2 — word colouring: green from 80, amber from 60, red below. */
export type WordColor = 'green' | 'amber' | 'red';

export function wordColor(score: number): WordColor {
  if (score >= 80) return 'green';
  if (score >= 60) return 'amber';
  return 'red';
}

/** §9.3 fallback — words per minute targets by level. */
export function targetWpmRange(cefr: CefrLevel): { min: number; max: number } {
  if (cefr === 'A1' || cefr === 'A2') return { min: 90, max: 120 };
  if (cefr === 'B1' || cefr === 'B2') return { min: 110, max: 150 };
  return { min: 130, max: 170 };
}

export interface FluencyInput {
  wordCount: number;
  durationMs: number;
  silenceMs: number;
  /** Pauses longer than 0.5s inside the utterance. */
  longPauses: number;
  /** Filler words such as uh and um. */
  fillers: number;
  cefr: CefrLevel;
}

/**
 * §9.3 fallback — used when Azure Pronunciation Assessment is not configured.
 * Speaking rate against the level target, then penalties for pauses and fillers.
 */
export function computeFluency(input: FluencyInput): number {
  const speakingMs = Math.max(1, input.durationMs - input.silenceMs);
  const wpm = (input.wordCount / speakingMs) * 60_000;
  const { min, max } = targetWpmRange(input.cefr);

  let base: number;
  if (wpm >= min && wpm <= max) {
    base = 100;
  } else if (wpm < min) {
    base = Math.max(0, 100 - ((min - wpm) / min) * 100);
  } else {
    base = Math.max(0, 100 - ((wpm - max) / max) * 60);
  }

  const penalty = Math.min(30, input.longPauses * 3 + input.fillers * 2);
  return Number(Math.max(0, Math.min(100, base - penalty)).toFixed(1));
}

export function computeCompleteness(matchedWords: number, referenceWords: number): number {
  if (referenceWords <= 0) return 0;
  return Number(Math.max(0, Math.min(100, (matchedWords / referenceWords) * 100)).toFixed(1));
}

// ---------------------------------------------------------------------------
// §7.6.3 — the Vietnamese speaker error set. This table is the reason Speaking
// is the differentiating module: generic scoring does not name these mistakes.
// ---------------------------------------------------------------------------

export interface VietnameseErrorPattern {
  key: string;
  labelVi: string;
  /** IPA symbols or pseudo-phonemes reported by the assessor. */
  phonemes: string[];
  exampleVi: string;
  /** How the mouth should be shaped, in Vietnamese. */
  tipVi: string;
  minimalPairs: [string, string][];
  drillFocus: string;
}

export const VIETNAMESE_ERROR_PATTERNS: VietnameseErrorPattern[] = [
  {
    key: 'final-consonant',
    labelVi: 'Mất phụ âm cuối',
    phonemes: ['final-t', 'final-d', 'final-k', 'final-p', 'final-s', 'final-z'],
    exampleVi: 'cat đọc thành /kæ/, worked đọc thành /wɜːk/',
    tipVi: 'Tiếng Việt không bật hơi phụ âm cuối. Hãy kết thúc từ bằng lưỡi hoặc môi chạm đúng vị trí và bật nhẹ hơi ra.',
    minimalPairs: [
      ['bat', 'back'],
      ['bad', 'bag'],
      ['walk', 'walked'],
      ['card', 'car'],
    ],
    drillFocus: 'final-consonant',
  },
  {
    key: 'th-sounds',
    labelVi: 'Âm /θ/ và /ð/ thành /t/ /d/',
    phonemes: ['θ', 'ð'],
    exampleVi: 'think đọc thành tink, this đọc thành dis',
    tipVi: 'Đặt đầu lưỡi giữa hai hàm răng rồi thổi hơi ra. Với /ð/ thì rung dây thanh, với /θ/ thì không.',
    minimalPairs: [
      ['think', 'sink'],
      ['thin', 'tin'],
      ['they', 'day'],
      ['breathe', 'breed'],
    ],
    drillFocus: 'th',
  },
  {
    key: 'sh-ch',
    labelVi: 'Âm /ʃ/ thành /s/, /tʃ/ thành /t/',
    phonemes: ['ʃ', 'tʃ', 'ʒ', 'dʒ'],
    exampleVi: 'she đọc thành see, chair đọc thành tear',
    tipVi: 'Tròn môi và kéo lưỡi lùi về sau một chút, luồng hơi rộng hơn khi phát âm /s/.',
    minimalPairs: [
      ['she', 'sea'],
      ['ship', 'sip'],
      ['chair', 'care'],
      ['watch', 'watt'],
    ],
    drillFocus: 'sh-ch',
  },
  {
    key: 'v-sound',
    labelVi: 'Âm /v/ thành /j/ hoặc /b/',
    phonemes: ['v'],
    exampleVi: 'very đọc thành yery',
    tipVi: 'Răng trên chạm nhẹ môi dưới rồi rung dây thanh, không dùng hai môi như âm /b/.',
    minimalPairs: [
      ['very', 'berry'],
      ['vote', 'boat'],
      ['van', 'ban'],
    ],
    drillFocus: 'v',
  },
  {
    key: 'consonant-cluster',
    labelVi: 'Cụm phụ âm',
    phonemes: ['str', 'spr', 'skt', 'kst', 'sk', 'st'],
    exampleVi: 'street đọc thành s-treet, asked đọc thành /æst/',
    tipVi: 'Không thêm nguyên âm vào giữa cụm. Đọc liền mạch, chậm lại rồi tăng tốc dần.',
    minimalPairs: [
      ['street', 'seat'],
      ['asked', 'ask'],
      ['texts', 'text'],
    ],
    drillFocus: 'cluster',
  },
  {
    key: 'plural-s',
    labelVi: 'Đuôi -s / -es',
    phonemes: ['final-s', 'final-z', 'ɪz', 'ez'],
    exampleVi: 'books /s/ khác dogs /z/ khác watches /ɪz/',
    tipVi: 'Sau âm vô thanh đọc /s/, sau âm hữu thanh đọc /z/, sau âm xuýt đọc /ɪz/.',
    minimalPairs: [
      ['books', 'book'],
      ['dogs', 'dog'],
      ['watches', 'watch'],
    ],
    drillFocus: 'plural-s',
  },
  {
    key: 'past-ed',
    labelVi: 'Đuôi -ed',
    // Distinct pseudo-phonemes: a bare final /t/ belongs to final-consonant, an
    // -ed ending is only this pattern when the assessor tags it as one.
    phonemes: ['ed-t', 'ed-d', 'ɪd'],
    exampleVi: 'walked /t/, played /d/, wanted /ɪd/',
    tipVi: 'Chỉ thêm một âm tiết khi động từ kết thúc bằng /t/ hoặc /d/.',
    minimalPairs: [
      ['walked', 'walk'],
      ['played', 'play'],
      ['wanted', 'want'],
    ],
    drillFocus: 'past-ed',
  },
  {
    key: 'word-stress',
    labelVi: 'Trọng âm từ',
    phonemes: ['stress'],
    exampleVi: 'reCORD (động từ) khác RECord (danh từ)',
    tipVi: 'Âm tiết mang trọng âm phải dài hơn, to hơn và cao giọng hơn hai âm tiết còn lại.',
    minimalPairs: [
      ['record (n)', 'record (v)'],
      ['present (n)', 'present (v)'],
      ['object (n)', 'object (v)'],
    ],
    drillFocus: 'stress',
  },
  {
    key: 'question-intonation',
    labelVi: 'Ngữ điệu câu hỏi',
    phonemes: ['intonation'],
    exampleVi: 'Câu Yes/No lên giọng, câu Wh- xuống giọng',
    tipVi: 'Giữ giọng đi lên ở cuối câu hỏi Yes/No, hạ giọng ở cuối câu hỏi bắt đầu bằng Wh-.',
    minimalPairs: [
      ['Are you ready?', 'Where are you?'],
      ['Did he call?', 'Why did he call?'],
    ],
    drillFocus: 'intonation',
  },
];

const PHONEME_TO_PATTERN = new Map<string, VietnameseErrorPattern>();
for (const pattern of VIETNAMESE_ERROR_PATTERNS) {
  for (const phoneme of pattern.phonemes) {
    // First pattern wins, so table order decides which drill a shared sound maps to.
    if (!PHONEME_TO_PATTERN.has(phoneme)) PHONEME_TO_PATTERN.set(phoneme, pattern);
  }
}

export function patternForPhoneme(phoneme: string): VietnameseErrorPattern | null {
  return PHONEME_TO_PATTERN.get(phoneme) ?? null;
}

export interface DetectedIssue {
  phoneme: string;
  errorCount: number;
  totalCount: number;
  pattern: VietnameseErrorPattern | null;
}

/**
 * §9.3 — after each assessment, every phoneme scoring below 60 is recorded so
 * Analytics and the drill recommender can see which sounds keep failing.
 */
export function detectIssues(wordScores: WordScore[], threshold = 60): DetectedIssue[] {
  const counters = new Map<string, { errors: number; total: number }>();

  for (const word of wordScores) {
    for (const phoneme of word.phonemes ?? []) {
      const entry = counters.get(phoneme.phoneme) ?? { errors: 0, total: 0 };
      entry.total += 1;
      if (phoneme.score < threshold) entry.errors += 1;
      counters.set(phoneme.phoneme, entry);
    }
    // An omitted final consonant never reaches the phoneme list, so infer it.
    if (word.errorType === 'Omission') {
      const inferred = inferFinalPhoneme(word.word);
      if (inferred) {
        const entry = counters.get(inferred) ?? { errors: 0, total: 0 };
        entry.total += 1;
        entry.errors += 1;
        counters.set(inferred, entry);
      }
    }
  }

  return [...counters.entries()]
    .filter(([, value]) => value.errors > 0)
    .map(([phoneme, value]) => ({
      phoneme,
      errorCount: value.errors,
      totalCount: value.total,
      pattern: patternForPhoneme(phoneme),
    }))
    .sort((a, b) => b.errorCount - a.errorCount);
}

function inferFinalPhoneme(word: string): string | null {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  const last = clean.at(-1);
  if (!last) return null;
  if ('tdkpsz'.includes(last)) return `final-${last}`;
  return null;
}

/** Which drill set to offer next, given the learner accumulated issues. */
export function recommendDrillFocus(
  issues: { phoneme: string; errorCount: number; totalCount: number }[],
  minAttempts = 3,
  minErrorRate = 0.3,
): string[] {
  const scored = new Map<string, number>();
  for (const issue of issues) {
    if (issue.totalCount < minAttempts) continue;
    const rate = issue.errorCount / issue.totalCount;
    if (rate < minErrorRate) continue;
    const pattern = patternForPhoneme(issue.phoneme);
    if (!pattern) continue;
    scored.set(pattern.drillFocus, (scored.get(pattern.drillFocus) ?? 0) + issue.errorCount);
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([focus]) => focus);
}
