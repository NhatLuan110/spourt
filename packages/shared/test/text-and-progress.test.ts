import { describe, expect, it } from 'vitest';
import {
  CEFR_LEVELS,
  LEARNING_GOALS,
  SHOP_ITEMS,
  TOPICS,
  TOPIC_SLUGS,
  areHomophones,
  cefrFromScore,
  coinsFromXp,
  compareCefr,
  countWords,
  levelFromXp,
  levelProgress,
  normalizeForComparison,
  seededShuffle,
  slugify,
  stepCefr,
  titleCase,
  tokenizeWords,
  treeHealth,
  treeStageFromXp,
  levenshtein,
  streakMultiplier,
} from '../src/index.js';

describe('slugify', () => {
  it('strips Vietnamese diacritics', () => {
    expect(slugify('Môi trường')).toBe('moi-truong');
    expect(slugify('Đời sống')).toBe('doi-song');
    expect(slugify('Sức khỏe')).toBe('suc-khoe');
  });

  it('handles English words and punctuation', () => {
    expect(slugify('Word Class')).toBe('word-class');
    expect(slugify('  spaced   out  ')).toBe('spaced-out');
    expect(slugify("don't stop")).toBe('don-t-stop');
  });
});

describe('normalizeForComparison', () => {
  it('expands contractions so both spellings match', () => {
    expect(normalizeForComparison("I'm ready")).toBe('i am ready');
    expect(normalizeForComparison("don't stop")).toBe('do not stop');
    expect(normalizeForComparison("can't")).toBe('cannot');
  });

  it('drops punctuation and collapses whitespace', () => {
    expect(normalizeForComparison('Hello,   world!')).toBe('hello world');
    expect(normalizeForComparison('"Quoted."')).toBe('quoted');
  });

  it('accepts curly apostrophes', () => {
    expect(normalizeForComparison('I’m here')).toBe('i am here');
  });
});

describe('tokenize and count', () => {
  it('splits normalised words', () => {
    expect(tokenizeWords("I'm not sure.")).toEqual(['i', 'am', 'not', 'sure']);
    expect(tokenizeWords('')).toEqual([]);
    expect(tokenizeWords('   ')).toEqual([]);
  });

  it('counts words for the writing editor', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('  ')).toBe(0);
    expect(countWords('line\nbreak')).toBe(2);
  });
});

describe('levenshtein', () => {
  it('measures edit distance', () => {
    expect(levenshtein('cat', 'cat')).toBe(0);
    expect(levenshtein('cat', 'cut')).toBe(1);
    expect(levenshtein('beautiful', 'beatiful')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('homophones', () => {
  it('recognises the pairs learners actually confuse', () => {
    expect(areHomophones('there', 'their')).toBe(true);
    expect(areHomophones('to', 'too')).toBe(true);
    expect(areHomophones('affect', 'effect')).toBe(true);
  });

  it('is not fooled by identical or unrelated words', () => {
    expect(areHomophones('there', 'there')).toBe(false);
    expect(areHomophones('there', 'apple')).toBe(false);
  });
});

describe('seededShuffle', () => {
  it('is deterministic for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });

  it('changes with the seed and keeps every element', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = seededShuffle(items, 1);
    const b = seededShuffle(items, 2);
    expect(a).not.toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });

  it('leaves the input array untouched', () => {
    const items = [1, 2, 3];
    seededShuffle(items, 7);
    expect(items).toEqual([1, 2, 3]);
  });
});

describe('CEFR helpers', () => {
  it('maps scores onto bands at the documented boundaries', () => {
    expect(cefrFromScore(0)).toBe('A1');
    expect(cefrFromScore(24)).toBe('A1');
    expect(cefrFromScore(25)).toBe('A2');
    expect(cefrFromScore(40)).toBe('B1');
    expect(cefrFromScore(58)).toBe('B2');
    expect(cefrFromScore(75)).toBe('C1');
    expect(cefrFromScore(89)).toBe('C2');
  });

  it('steps up and down without leaving the scale', () => {
    expect(stepCefr('B1', 1)).toBe('B2');
    expect(stepCefr('B1', -1)).toBe('A2');
    expect(stepCefr('A1', -5)).toBe('A1');
    expect(stepCefr('C2', 5)).toBe('C2');
  });

  it('orders levels', () => {
    expect(compareCefr('A1', 'C2')).toBeLessThan(0);
    expect(compareCefr('B2', 'B2')).toBe(0);
    expect([...CEFR_LEVELS].sort(compareCefr)).toEqual([...CEFR_LEVELS]);
  });
});

describe('levels, coins and the tree', () => {
  it('reports progress inside the current level', () => {
    const progress = levelProgress(150);
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(50);
    expect(progress.xpForNextLevel).toBe(200);
    expect(progress.progressPct).toBe(25);
  });

  it('handles a brand new account', () => {
    expect(levelProgress(0)).toMatchObject({ level: 1, xpIntoLevel: 0, progressPct: 0 });
    expect(levelFromXp(-10)).toBe(1);
  });

  it('awards one coin per ten XP', () => {
    expect(coinsFromXp(0)).toBe(0);
    expect(coinsFromXp(9)).toBe(0);
    expect(coinsFromXp(35)).toBe(3);
  });

  it('applies the streak multiplier tiers', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(6)).toBe(1);
    expect(streakMultiplier(7)).toBe(1.1);
    expect(streakMultiplier(29)).toBe(1.1);
    expect(streakMultiplier(30)).toBe(1.2);
    expect(streakMultiplier(100)).toBe(1.3);
  });

  it('grows and never shrinks the tree stage', () => {
    expect(treeStageFromXp(0).key).toBe('seed');
    expect(treeStageFromXp(300).key).toBe('sprout');
    expect(treeStageFromXp(40000).key).toBe('garden');
  });

  it('yellows leaves after a missed day and wilts after three', () => {
    expect(treeHealth(0)).toBe('healthy');
    expect(treeHealth(1)).toBe('yellowing');
    expect(treeHealth(2)).toBe('yellowing');
    expect(treeHealth(3)).toBe('wilting');
    expect(treeHealth(30)).toBe('wilting');
  });
});

describe('seed constants', () => {
  it('has the eight required topics and the everyday collection with unique slugs', () => {
    expect(TOPICS).toHaveLength(9);
    expect(new Set(TOPIC_SLUGS).size).toBe(9);
    expect(TOPIC_SLUGS).toEqual(
      expect.arrayContaining([
        'environment',
        'space',
        'education',
        'work',
        'travel',
        'health',
        'technology',
        'daily-life',
      ]),
    );
  });

  it('gives every topic subtopics, an emoji and a colour token', () => {
    for (const topic of TOPICS) {
      expect(topic.subtopics.length).toBeGreaterThanOrEqual(6);
      expect(topic.emoji).toBeTruthy();
      expect(topic.colorToken.startsWith('--')).toBe(true);
      expect(topic.minWords).toBe(topic.slug === 'everyday-communication' ? 2000 : 100);
    }
  });

  it('keeps subtopic slugs globally unique', () => {
    const slugs = TOPICS.flatMap((topic) => topic.subtopics.map((sub) => sub.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('points every learning goal at real topics', () => {
    for (const goal of LEARNING_GOALS) {
      for (const slug of goal.topics) {
        expect(TOPIC_SLUGS).toContain(slug);
      }
    }
  });

  it('prices every shop item', () => {
    for (const item of SHOP_ITEMS) {
      expect(item.price).toBeGreaterThan(0);
      expect(item.nameVi).toBeTruthy();
    }
  });
});

describe('titleCase', () => {
  it('capitalises each word', () => {
    expect(titleCase('word class practice')).toBe('Word Class Practice');
  });
});
