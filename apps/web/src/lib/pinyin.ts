import { toneOf } from '@sprout/shared';

const TONE_MARKS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

/**
 * Đặt dấu thanh cho một âm tiết ghi kiểu số: "hao3" → "hǎo".
 *
 * Quy tắc: có `a` thì dấu vào `a`; không thì vào `o` hoặc `e`; riêng vần `iu`
 * dấu rơi vào chữ cái cuối; còn lại vào nguyên âm cuối cùng.
 */
export function applyToneMark(syllable: string): string {
  const tone = toneOf(syllable);
  const base = syllable.replace(/[1-5]$/, '').toLowerCase();
  if (tone === 5) return base.replace(/v/g, 'ü');

  const index = base.includes('a')
    ? base.indexOf('a')
    : base.includes('o') && !base.includes('iu')
      ? base.indexOf('o')
      : base.includes('e')
        ? base.indexOf('e')
        : base.search(/[aeiouv](?=[^aeiouv]*$)/);

  const vowel = index < 0 ? undefined : base[index];
  if (!vowel) return base.replace(/v/g, 'ü');
  const marked = TONE_MARKS[vowel]?.[tone - 1];
  if (!marked) return base.replace(/v/g, 'ü');
  return `${base.slice(0, index)}${marked}${base.slice(index + 1)}`.replace(/v/g, 'ü');
}

/** "ni3 hao3" → "nǐ hǎo". */
export function toneMarked(pinyinNumeric: string | null | undefined): string {
  if (!pinyinNumeric) return '';
  return pinyinNumeric.split(/\s+/).filter(Boolean).map(applyToneMark).join(' ');
}

/** Màu theo thanh, dùng cho biến CSS --tone-1..5. */
export function toneColor(pinyinNumeric: string | null | undefined): string {
  if (!pinyinNumeric) return 'var(--tone-5)';
  return `var(--tone-${toneOf(pinyinNumeric.split(/\s+/)[0] ?? '')})`;
}
