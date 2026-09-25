import { describe, expect, it } from 'vitest';
import { anchorIssues, normalizeFeedback } from '@app/modules/writing/writing.service';

/**
 * The offsets that drive highlighting are the one part of writing feedback the
 * model cannot be trusted with, so they are computed here and tested here. The
 * live grading run lives in scripts/demo-p3.ts, which spends quota.
 */

const issue = (original: string, overrides: Partial<Parameters<typeof anchorIssues>[1][number]> = {}) => ({
  original,
  suggestion: 'fixed',
  category: 'grammar',
  severity: 'minor' as const,
  whyVi: 'lý do',
  ...overrides,
});

describe('anchorIssues', () => {
  const text = 'She go to school yesterday. I have went there too.';

  it('finds the offsets of a quoted phrase', () => {
    const [anchored] = anchorIssues(text, [issue('She go')]);
    expect(anchored).toMatchObject({ start: 0, end: 6, original: 'She go' });
    expect(text.slice(anchored!.start, anchored!.end)).toBe('She go');
  });

  it('anchors several issues and returns them in document order', () => {
    const anchored = anchorIssues(text, [issue('have went'), issue('She go')]);
    expect(anchored.map((entry) => entry.original)).toEqual(['She go', 'have went']);
    expect(anchored[0]!.start).toBeLessThan(anchored[1]!.start);
  });

  it('drops an issue whose text is not in the submission, rather than mis-highlighting', () => {
    // A grader that paraphrases instead of quoting would otherwise land the
    // highlight on unrelated words.
    const anchored = anchorIssues(text, [issue('a sentence that never appears')]);
    expect(anchored).toHaveLength(0);
  });

  it('keeps repeated phrases in the order the grader listed them', () => {
    const repeated = 'I go there. I go there again.';
    const anchored = anchorIssues(repeated, [issue('I go'), issue('I go')]);
    expect(anchored).toHaveLength(2);
    expect(anchored[0]!.start).toBe(0);
    expect(anchored[1]!.start).toBe(12);
  });

  it('falls back to a case-insensitive match', () => {
    const anchored = anchorIssues(text, [issue('she go')]);
    expect(anchored).toHaveLength(1);
    // The learner's own casing is echoed back, not the grader's.
    expect(anchored[0]!.original).toBe('She go');
  });

  it('ignores an empty quote', () => {
    expect(anchorIssues(text, [issue('   ')])).toHaveLength(0);
  });

  it('trims surrounding whitespace before searching', () => {
    const anchored = anchorIssues(text, [issue('  She go  ')]);
    expect(anchored).toHaveLength(1);
    expect(anchored[0]!.start).toBe(0);
  });

  it('carries the category, severity and explanation through unchanged', () => {
    const [anchored] = anchorIssues(text, [
      issue('She go', { category: 'grammar', severity: 'major', whyVi: 'thiếu -es', suggestion: 'She goes' }),
    ]);
    expect(anchored).toMatchObject({
      category: 'grammar',
      severity: 'major',
      whyVi: 'thiếu -es',
      suggestion: 'She goes',
    });
  });

  it('handles an empty issue list', () => {
    expect(anchorIssues(text, [])).toEqual([]);
  });

  it('never produces an offset outside the text', () => {
    const anchored = anchorIssues(text, [issue('yesterday'), issue('too')]);
    for (const entry of anchored) {
      expect(entry.start).toBeGreaterThanOrEqual(0);
      expect(entry.end).toBeLessThanOrEqual(text.length);
      expect(text.slice(entry.start, entry.end)).toBe(entry.original);
    }
  });
});

describe('normalizeFeedback', () => {
  const base = { overallScore: 60, cefrEstimate: 'A2', issues: [], rewrite: '' };

  it('leaves the four canonical names alone', () => {
    const raw = {
      ...base,
      criteria: ['task', 'organization', 'vocabulary', 'grammar'].map((criterion) => ({
        criterion,
        score: 5,
        commentVi: 'x',
      })),
    };
    const out = normalizeFeedback(raw) as { criteria: { criterion: string }[] };
    expect(out.criteria.map((entry) => entry.criterion)).toEqual([
      'task',
      'organization',
      'vocabulary',
      'grammar',
    ]);
  });

  it('maps the IELTS-style names a model tends to reach for', () => {
    const raw = {
      ...base,
      criteria: [
        { criterion: 'Task Achievement', score: 5, commentVi: 'x' },
        { criterion: 'Coherence and Cohesion', score: 6, commentVi: 'x' },
        { criterion: 'Lexical Resource', score: 4, commentVi: 'x' },
        { criterion: 'Grammatical Range and Accuracy', score: 3, commentVi: 'x' },
      ],
    };
    const out = normalizeFeedback(raw) as { criteria: { criterion: string }[] };
    expect(out.criteria.map((entry) => entry.criterion)).toEqual([
      'task',
      'organization',
      'vocabulary',
      'grammar',
    ]);
  });

  it('maps the Vietnamese names too', () => {
    const raw = {
      ...base,
      criteria: [
        { criterion: 'Ngữ pháp', score: 5, commentVi: 'x' },
        { criterion: 'Từ vựng', score: 5, commentVi: 'x' },
      ],
    };
    const out = normalizeFeedback(raw) as { criteria: { criterion: string }[] };
    expect(out.criteria.map((entry) => entry.criterion)).toEqual(['grammar', 'vocabulary']);
  });

  it('ignores case and stray whitespace', () => {
    const raw = { ...base, criteria: [{ criterion: '  ORGANISATION  ', score: 5, commentVi: 'x' }] };
    const out = normalizeFeedback(raw) as { criteria: { criterion: string }[] };
    expect(out.criteria[0]?.criterion).toBe('organization');
  });

  it('drops a criterion nobody recognises rather than guessing', () => {
    const raw = {
      ...base,
      criteria: [
        { criterion: 'task', score: 5, commentVi: 'x' },
        { criterion: 'handwriting', score: 9, commentVi: 'x' },
      ],
    };
    const out = normalizeFeedback(raw) as { criteria: { criterion: string }[] };
    expect(out.criteria).toHaveLength(1);
    expect(out.criteria[0]?.criterion).toBe('task');
  });

  it('keeps the score and comment untouched', () => {
    const raw = {
      ...base,
      criteria: [{ criterion: 'Task Achievement', score: 7.5, commentVi: 'giữ nguyên' }],
    };
    const out = normalizeFeedback(raw) as { criteria: { score: number; commentVi: string }[] };
    expect(out.criteria[0]).toMatchObject({ score: 7.5, commentVi: 'giữ nguyên' });
  });

  it('passes through anything that is not an object with criteria', () => {
    expect(normalizeFeedback(null)).toBeNull();
    expect(normalizeFeedback('nonsense')).toBe('nonsense');
    expect(normalizeFeedback({ overallScore: 1 })).toEqual({ overallScore: 1 });
  });
});
