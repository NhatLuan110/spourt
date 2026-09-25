import { describe, expect, it } from 'vitest';
import { VIETNAMESE_ERROR_PATTERNS } from '@sprout/scoring';
import type { WordScore } from '@sprout/scoring';
import { buildFeedback } from '@app/modules/speaking/speaking.service';
import { buildRoleplayPrompt } from '@app/modules/speaking/roleplay.service';

const word = (text: string, score: number, errorType = 'None'): WordScore => ({
  word: text,
  score,
  errorType,
});

describe('buildFeedback', () => {
  it('praises a strong attempt without inventing faults', () => {
    const feedback = buildFeedback(92, [word('the', 100), word('cat', 95)], 'mẹo');
    expect(feedback).toContain('Rất tốt');
    expect(feedback).not.toContain('Bị nuốt mất');
    // The drill tip is not repeated when there is nothing to fix.
    expect(feedback).not.toContain('mẹo');
  });

  it('names the words that were swallowed', () => {
    const feedback = buildFeedback(55, [
      word('cat', 100),
      word('sat', 0, 'Omission'),
      word('mat', 0, 'Omission'),
    ]);
    expect(feedback).toContain('Bị nuốt mất: sat, mat');
  });

  it('separates mispronounced words from omitted ones', () => {
    const feedback = buildFeedback(55, [
      word('think', 40, 'Mispronunciation'),
      word('so', 0, 'Omission'),
    ]);
    expect(feedback).toContain('Chưa rõ: think');
    expect(feedback).toContain('Bị nuốt mất: so');
  });

  it('adds the drill tip when the attempt was not strong', () => {
    const feedback = buildFeedback(50, [word('think', 30, 'Mispronunciation')], 'Đặt lưỡi giữa răng.');
    expect(feedback).toContain('Đặt lưỡi giữa răng.');
  });

  it('is encouraging rather than blunt about a poor attempt', () => {
    const feedback = buildFeedback(30, [word('a', 20, 'Mispronunciation')]);
    expect(feedback).toContain('thử lại');
  });

  it('handles an attempt with no words at all', () => {
    expect(buildFeedback(0, [])).toBeTruthy();
  });
});

describe('buildRoleplayPrompt', () => {
  const scenario = {
    id: 'x',
    slug: 'ordering-at-a-cafe',
    title: 'Ordering at a Cafe',
    titleVi: 'Gọi đồ ở quán',
    cefr: 'A2' as const,
    category: 'restaurant',
    coverImageUrl: null,
    aiPersona: 'Bạn là nhân viên pha chế.',
    objectives: ['Gọi được đồ uống', 'Hỏi được giá'],
    usefulPhrases: [],
    maxTurns: 10,
  };

  it('carries the persona through', () => {
    expect(buildRoleplayPrompt(scenario, 1)).toContain('Bạn là nhân viên pha chế.');
  });

  it('lists every objective so the model can report which are met', () => {
    const prompt = buildRoleplayPrompt(scenario, 1);
    for (const objective of scenario.objectives) {
      expect(prompt).toContain(objective);
    }
  });

  it('tells the model which turn it is on, so it can wrap up', () => {
    expect(buildRoleplayPrompt(scenario, 7)).toContain('lượt 7/10');
  });

  it('insists on staying in English, which is the point of the exercise', () => {
    const prompt = buildRoleplayPrompt(scenario, 1);
    expect(prompt).toContain('LUÔN nói bằng tiếng Anh');
    expect(prompt).toContain('kể cả khi người học viết tiếng Việt');
  });

  it('keeps corrections out of the character’s dialogue', () => {
    expect(buildRoleplayPrompt(scenario, 1)).toContain('Đừng nhận xét về ngữ pháp trong lời thoại');
  });
});

describe('drill coverage of the §7.6.3 error set', () => {
  it('has an error pattern for every focus a drill can target', () => {
    // The seeder rejects a drill whose focus is unknown; this asserts the other
    // direction, that the table itself has no duplicate or empty focus.
    const focuses = VIETNAMESE_ERROR_PATTERNS.map((pattern) => pattern.drillFocus);
    expect(new Set(focuses).size).toBe(focuses.length);
    expect(focuses.every((focus) => focus.length > 0)).toBe(true);
  });

  it('gives every pattern a Vietnamese label, tip and minimal pairs', () => {
    for (const pattern of VIETNAMESE_ERROR_PATTERNS) {
      expect(pattern.labelVi.length, pattern.key).toBeGreaterThan(0);
      expect(pattern.tipVi.length, pattern.key).toBeGreaterThan(20);
      expect(pattern.minimalPairs.length, pattern.key).toBeGreaterThan(0);
    }
  });
});
