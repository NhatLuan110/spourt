import { CEFR_LEVELS, levenshtein, tokenizeWords } from '@sprout/shared';

/**
 * §7.3.4 — "distractor không ngẫu nhiên".
 *
 * A multiple-choice question is only worth answering when the wrong options are
 * plausible. Random words from the database are trivially eliminated, which
 * teaches nothing and inflates the accuracy the SRS scheduler relies on.
 *
 * A good distractor is close to the target in the ways a learner has not
 * mastered yet — same part of speech, same topic, same CEFR band, similar
 * shape — while being clearly a different meaning. A distractor that means the
 * same thing is not hard, it is unfair, so overlapping definitions are pushed
 * down rather than up.
 */
export interface DistractorCandidate {
  wordId: string;
  lemma: string;
  pos: string;
  cefr: string;
  topicSlugs: string[];
  frequencyRank: number | null;
  definitionVi: string;
  /** Lemmas declared as synonyms of this candidate, in either direction. */
  synonyms?: string[];
}

export const DISTRACTOR_WEIGHTS = {
  samePos: 40,
  sharedTopic: 25,
  sameCefr: 15,
  adjacentCefr: 7,
  /** Maximum contribution of frequency-band closeness. */
  frequency: 10,
  /** Maximum contribution of orthographic similarity. */
  orthographic: 8,
  /** Subtracted when the two definitions overlap enough to be ambiguous. */
  meaningOverlapPenalty: 60,
} as const;

/** Definitions sharing at least this fraction of content words are ambiguous. */
export const AMBIGUITY_THRESHOLD = 0.5;

/** Vietnamese function words carry no meaning for the overlap test. */
const VI_STOPWORDS = new Set([
  'là', 'của', 'và', 'có', 'một', 'các', 'những', 'cho', 'được', 'người',
  'việc', 'sự', 'trong', 'đến', 'với', 'khi', 'thì', 'mà', 'để', 'không', 'ở',
  'từ', 'này', 'đó', 'ra', 'vào', 'nên', 'hay', 'hoặc', 'bị', 'theo', 'về',
]);

function cefrDistance(a: string, b: string): number {
  const left = CEFR_LEVELS.indexOf(a as (typeof CEFR_LEVELS)[number]);
  const right = CEFR_LEVELS.indexOf(b as (typeof CEFR_LEVELS)[number]);
  if (left < 0 || right < 0) return CEFR_LEVELS.length;
  return Math.abs(left - right);
}

/** Log-scaled so ranks 100 and 300 feel closer than 3,000 and 3,200. */
function frequencyCloseness(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0.35;
  const gap = Math.abs(Math.log10(Math.max(1, a)) - Math.log10(Math.max(1, b)));
  return Math.max(0, 1 - gap);
}

function orthographicCloseness(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return Math.max(0, 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / longest);
}

function contentWords(definition: string): Set<string> {
  return new Set(
    definition
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1 && !VI_STOPWORDS.has(token)),
  );
}

/** Overlap of the two Vietnamese definitions, relative to the shorter one. */
export function meaningOverlap(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

export interface ScoredDistractor extends DistractorCandidate {
  score: number;
  /** Why this option was chosen — surfaced in tests and the content tools. */
  reasons: string[];
}

export function scoreDistractor(
  target: DistractorCandidate,
  candidate: DistractorCandidate,
): ScoredDistractor {
  const reasons: string[] = [];
  let score = 0;

  if (candidate.pos === target.pos) {
    score += DISTRACTOR_WEIGHTS.samePos;
    reasons.push('same-pos');
  }

  const sharesTopic = candidate.topicSlugs.some((slug) => target.topicSlugs.includes(slug));
  if (sharesTopic) {
    score += DISTRACTOR_WEIGHTS.sharedTopic;
    reasons.push('shared-topic');
  }

  const levelGap = cefrDistance(target.cefr, candidate.cefr);
  if (levelGap === 0) {
    score += DISTRACTOR_WEIGHTS.sameCefr;
    reasons.push('same-cefr');
  } else if (levelGap === 1) {
    score += DISTRACTOR_WEIGHTS.adjacentCefr;
    reasons.push('adjacent-cefr');
  }

  score +=
    frequencyCloseness(target.frequencyRank, candidate.frequencyRank) *
    DISTRACTOR_WEIGHTS.frequency;
  score += orthographicCloseness(target.lemma, candidate.lemma) * DISTRACTOR_WEIGHTS.orthographic;

  // A synonym is never a distractor: both answers would be defensible.
  const declaredSynonym =
    (target.synonyms ?? []).includes(candidate.lemma) ||
    (candidate.synonyms ?? []).includes(target.lemma);
  const overlap = meaningOverlap(target.definitionVi, candidate.definitionVi);
  if (declaredSynonym || overlap >= AMBIGUITY_THRESHOLD) {
    score -= DISTRACTOR_WEIGHTS.meaningOverlapPenalty;
    reasons.push(declaredSynonym ? 'synonym-penalty' : 'meaning-overlap-penalty');
  }

  return { ...candidate, score, reasons };
}

export interface PickDistractorsOptions {
  /** How many wrong options to return. */
  count: number;
  /** Excluded word ids, e.g. words already used elsewhere in the same set. */
  exclude?: Iterable<string>;
  /**
   * Deterministic tie-break seed. Two candidates that score identically should
   * not always appear in database order, or every learner sees the same quiz.
   */
  seed?: number;
}

/** Mulberry32 — small, fast, and reproducible from an integer seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rank the pool and take the best options. Ambiguous candidates keep their
 * penalty rather than being dropped, so a thin pool still yields four options
 * instead of collapsing the question to two.
 */
export function pickDistractors(
  target: DistractorCandidate,
  pool: DistractorCandidate[],
  options: PickDistractorsOptions,
): ScoredDistractor[] {
  const excluded = new Set(options.exclude ?? []);
  excluded.add(target.wordId);

  const random = mulberry32(options.seed ?? 1);
  const seen = new Set<string>();
  const scored = pool
    .filter((candidate) => {
      if (excluded.has(candidate.wordId)) return false;
      const key = candidate.lemma.toLowerCase();
      if (key === target.lemma.toLowerCase()) return false;
      // The same lemma can arrive twice through two senses.
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => ({ ...scoreDistractor(target, candidate), jitter: random() }))
    .sort((a, b) => b.score - a.score || a.jitter - b.jitter)
    .map(({ jitter: _jitter, ...rest }) => rest);

  return scored.slice(0, Math.max(0, options.count));
}

/**
 * §7.3.4 gap-fill — hide the answer but keep the task solvable: first letter,
 * then one underscore per remaining letter.
 */
export function gapHint(answer: string): string {
  const trimmed = answer.trim();
  if (trimmed.length === 0) return '';
  const [first, ...rest] = trimmed;
  return `${first ?? ''}${rest.map((char) => (/\s/.test(char) ? ' ' : '_')).join('')}`;
}

/**
 * Replace the target inside an example sentence with a blank. Offsets come from
 * the seeded Example rows, so inflected forms ("browsing") blank correctly.
 */
export function blankOut(
  sentence: string,
  start: number,
  end: number,
  blank = '____',
): { prompt: string; answer: string } | null {
  if (start < 0 || end > sentence.length || end <= start) return null;
  return {
    prompt: `${sentence.slice(0, start)}${blank}${sentence.slice(end)}`,
    answer: sentence.slice(start, end),
  };
}

/** How many content words a definition has — used to reject one-word glosses. */
export function definitionWeight(definition: string): number {
  return tokenizeWords(definition).length;
}
