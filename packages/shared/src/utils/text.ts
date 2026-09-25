/** Text helpers shared by seeding, scoring and the UI. */

// Combining diacritical marks, built from a string so the source file stays ASCII-safe.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "he's": 'he is',
  "she's": 'she is',
  "it's": 'it is',
  "that's": 'that is',
  "there's": 'there is',
  "what's": 'what is',
  "let's": 'let us',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "can't": 'cannot',
  "won't": 'will not',
  "wouldn't": 'would not',
  "shouldn't": 'should not',
  "couldn't": 'could not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "hadn't": 'had not',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "he'll": 'he will',
  "she'll": 'she will',
  "we'll": 'we will',
  "they'll": 'they will',
  "i'd": 'i would',
  "you'd": 'you would',
};

/** §9.5 step 1 — lowercase, strip edge punctuation, expand contractions. */
export function normalizeForComparison(input: string): string {
  let text = input.toLowerCase().replace(/[‘’]/g, "'").trim();
  for (const [contracted, expanded] of Object.entries(CONTRACTIONS)) {
    text = text.replace(new RegExp(`\\b${contracted}\\b`, 'g'), expanded);
  }
  return text
    .replace(/[.,!?;:"“”()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeWords(input: string): string[] {
  const normalized = normalizeForComparison(input);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

export function countWords(input: string): number {
  const trimmed = input.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length] ?? 0;
}

/** §9.5 step 5 — homophones are flagged separately: right sound, wrong word. */
export const HOMOPHONE_GROUPS: string[][] = [
  ['there', 'their', 'they are'],
  ['to', 'too', 'two'],
  ['your', 'you are'],
  ['its', 'it is'],
  ['hear', 'here'],
  ['weather', 'whether'],
  ['write', 'right'],
  ['through', 'threw'],
  ['buy', 'by', 'bye'],
  ['knew', 'new'],
  ['no', 'know'],
  ['peace', 'piece'],
  ['principal', 'principle'],
  ['affect', 'effect'],
  ['accept', 'except'],
  ['lose', 'loose'],
  ['than', 'then'],
];

export function areHomophones(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return false;
  return HOMOPHONE_GROUPS.some((group) => group.includes(left) && group.includes(right));
}

export function titleCase(input: string): string {
  return input.replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Deterministic shuffle so exercise ordering can be reproduced from a seed. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0 || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    const left = result[i] as T;
    const right = result[j] as T;
    result[i] = right;
    result[j] = left;
  }
  return result;
}
