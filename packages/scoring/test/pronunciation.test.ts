import { describe, expect, it } from 'vitest';
import {
  computeCompleteness,
  computeFluency,
  detectIssues,
  overallScore,
  patternForPhoneme,
  recommendDrillFocus,
  scoreBand,
  targetWpmRange,
  VIETNAMESE_ERROR_PATTERNS,
  wordColor,
} from '../src/index.js';

describe('overall score', () => {
  it('weights the four sub-scores as specified', () => {
    expect(
      overallScore({ accuracy: 80, fluency: 60, completeness: 100, prosody: 40 }),
    ).toBeCloseTo(0.45 * 80 + 0.25 * 60 + 0.15 * 100 + 0.15 * 40, 1);
  });

  it('clamps into 0..100', () => {
    expect(overallScore({ accuracy: 200, fluency: 200, completeness: 200, prosody: 200 })).toBe(100);
    expect(overallScore({ accuracy: -50, fluency: -50, completeness: -50, prosody: -50 })).toBe(0);
  });
});

describe('bands and colours', () => {
  it('maps scores onto the four bands', () => {
    expect(scoreBand(92)).toBe('excellent');
    expect(scoreBand(85)).toBe('excellent');
    expect(scoreBand(70)).toBe('good');
    expect(scoreBand(60)).toBe('fair');
    expect(scoreBand(54)).toBe('needs-work');
  });

  it('colours words at the 80 and 60 boundaries', () => {
    expect(wordColor(80)).toBe('green');
    expect(wordColor(79)).toBe('amber');
    expect(wordColor(60)).toBe('amber');
    expect(wordColor(59)).toBe('red');
  });
});

describe('fluency fallback', () => {
  it('gives full marks inside the level target range', () => {
    const score = computeFluency({
      wordCount: 20,
      durationMs: 10_000,
      silenceMs: 0,
      longPauses: 0,
      fillers: 0,
      cefr: 'B1',
    });
    expect(score).toBe(100);
  });

  it('penalises speaking too slowly', () => {
    const score = computeFluency({
      wordCount: 5,
      durationMs: 10_000,
      silenceMs: 0,
      longPauses: 0,
      fillers: 0,
      cefr: 'B1',
    });
    expect(score).toBeLessThan(50);
  });

  it('penalises pauses and fillers but never past minus 30', () => {
    const base = computeFluency({
      wordCount: 20,
      durationMs: 10_000,
      silenceMs: 0,
      longPauses: 0,
      fillers: 0,
      cefr: 'B1',
    });
    const noisy = computeFluency({
      wordCount: 20,
      durationMs: 10_000,
      silenceMs: 0,
      longPauses: 20,
      fillers: 20,
      cefr: 'B1',
    });
    expect(base - noisy).toBe(30);
  });

  it('ignores silence when computing speaking rate', () => {
    const withSilence = computeFluency({
      wordCount: 20,
      durationMs: 20_000,
      silenceMs: 10_000,
      longPauses: 0,
      fillers: 0,
      cefr: 'B1',
    });
    expect(withSilence).toBe(100);
  });

  it('uses different targets per level', () => {
    expect(targetWpmRange('A1')).toEqual({ min: 90, max: 120 });
    expect(targetWpmRange('B2')).toEqual({ min: 110, max: 150 });
    expect(targetWpmRange('C1')).toEqual({ min: 130, max: 170 });
  });

  it('penalises speaking far too fast', () => {
    const fast = computeFluency({
      wordCount: 100,
      durationMs: 10_000,
      silenceMs: 0,
      longPauses: 0,
      fillers: 0,
      cefr: 'A1',
    });
    expect(fast).toBeLessThan(100);
  });
});

describe('completeness', () => {
  it('is the share of reference words actually spoken', () => {
    expect(computeCompleteness(8, 10)).toBe(80);
    expect(computeCompleteness(0, 10)).toBe(0);
    expect(computeCompleteness(5, 0)).toBe(0);
  });
});

describe('Vietnamese error table', () => {
  it('covers every error listed in the specification', () => {
    const keys = VIETNAMESE_ERROR_PATTERNS.map((pattern) => pattern.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'final-consonant',
        'th-sounds',
        'sh-ch',
        'v-sound',
        'consonant-cluster',
        'plural-s',
        'past-ed',
        'word-stress',
        'question-intonation',
      ]),
    );
  });

  it('gives every pattern a tip and drills', () => {
    for (const pattern of VIETNAMESE_ERROR_PATTERNS) {
      expect(pattern.tipVi.length).toBeGreaterThan(20);
      expect(pattern.minimalPairs.length).toBeGreaterThan(1);
    }
  });

  it('maps a phoneme back to its pattern', () => {
    expect(patternForPhoneme('θ')?.key).toBe('th-sounds');
    expect(patternForPhoneme('ʃ')?.key).toBe('sh-ch');
    expect(patternForPhoneme('unknown-sound')).toBeNull();
  });
});

describe('issue detection', () => {
  it('records phonemes scoring below the threshold', () => {
    const issues = detectIssues([
      {
        word: 'think',
        score: 40,
        phonemes: [
          { phoneme: 'θ', score: 20 },
          { phoneme: 'ɪ', score: 95 },
          { phoneme: 'ŋ', score: 88 },
          { phoneme: 'k', score: 90 },
        ],
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.phoneme).toBe('θ');
    expect(issues[0]?.pattern?.key).toBe('th-sounds');
  });

  it('infers a dropped final consonant from an omission', () => {
    const issues = detectIssues([{ word: 'cat', score: 30, errorType: 'Omission' }]);
    expect(issues[0]?.phoneme).toBe('final-t');
    expect(issues[0]?.pattern?.key).toBe('final-consonant');
  });

  it('ignores omissions with no consonant ending', () => {
    expect(detectIssues([{ word: 'go', score: 10, errorType: 'Omission' }])).toHaveLength(0);
  });

  it('returns nothing when everything is pronounced well', () => {
    const issues = detectIssues([
      { word: 'hello', score: 95, phonemes: [{ phoneme: 'h', score: 92 }] },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('sorts the worst offender first', () => {
    const issues = detectIssues([
      { word: 'this', score: 40, phonemes: [{ phoneme: 'ð', score: 20 }] },
      { word: 'think', score: 40, phonemes: [{ phoneme: 'θ', score: 10 }] },
      { word: 'thought', score: 40, phonemes: [{ phoneme: 'θ', score: 15 }] },
    ]);
    expect(issues[0]?.phoneme).toBe('θ');
    expect(issues[0]?.errorCount).toBe(2);
  });
});

describe('drill recommendations', () => {
  it('suggests drills only once a sound fails often enough', () => {
    const focus = recommendDrillFocus([
      { phoneme: 'θ', errorCount: 5, totalCount: 8 },
      { phoneme: 'ʃ', errorCount: 1, totalCount: 1 },
      { phoneme: 'v', errorCount: 1, totalCount: 20 },
    ]);
    expect(focus).toEqual(['th']);
  });

  it('orders by how often the learner gets it wrong', () => {
    const focus = recommendDrillFocus([
      { phoneme: 'θ', errorCount: 3, totalCount: 5 },
      { phoneme: 'final-t', errorCount: 9, totalCount: 10 },
    ]);
    expect(focus).toEqual(['final-consonant', 'th']);
  });

  it('ignores sounds with no known pattern', () => {
    expect(recommendDrillFocus([{ phoneme: 'zzz', errorCount: 9, totalCount: 10 }])).toEqual([]);
  });
});
