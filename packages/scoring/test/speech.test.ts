import { describe, expect, it } from 'vitest';
import { FILLERS, overallWithoutProsody, scoreSpeech, wordSimilarity } from '../src/speech.js';

const say = (reference: string, transcript: string, durationMs = 3000) =>
  scoreSpeech({ reference, transcript, durationMs, cefr: 'B1' });

describe('wordSimilarity', () => {
  it('gives a perfect score to an exact match', () => {
    expect(wordSimilarity('think', 'think')).toBe(100);
  });

  it('forgives one edit in a long word more than in a short one', () => {
    const long = wordSimilarity('pronunciation', 'pronounciation');
    const short = wordSimilarity('cat', 'bat');
    expect(long).toBeGreaterThan(short);
  });

  it('scores a completely different word low', () => {
    expect(wordSimilarity('think', 'xyz')).toBeLessThan(30);
  });

  it('handles an empty string without dividing by zero', () => {
    expect(wordSimilarity('', '')).toBe(100);
    expect(wordSimilarity('a', '')).toBe(0);
  });
});

describe('scoreSpeech', () => {
  it('scores a perfect reading at the top', () => {
    const result = say('The train leaves at six', 'The train leaves at six');
    expect(result.scores.accuracy).toBe(100);
    expect(result.scores.completeness).toBe(100);
    expect(result.words.every((word) => word.errorType === 'None')).toBe(true);
  });

  it('ignores case and punctuation, which are not pronunciation', () => {
    const result = say('The train leaves at six.', 'the train leaves at six');
    expect(result.scores.accuracy).toBe(100);
  });

  it('marks a word the recogniser never heard as an omission', () => {
    const result = say('I want to go home', 'I want go home');
    const omitted = result.words.find((word) => word.errorType === 'Omission');
    expect(omitted?.word).toBe('to');
    expect(omitted?.score).toBe(0);
    expect(result.scores.completeness).toBeLessThan(100);
  });

  it('marks a word heard as something else as a mispronunciation, not an omission', () => {
    const result = say('I think so', 'I sink so');
    const wrong = result.words.find((word) => word.word === 'think');
    expect(wrong?.errorType).toBe('Mispronunciation');
    expect(wrong?.score).toBeLessThan(100);
    // th → s is the classic Vietnamese substitution; it must not read as
    // total failure, because the learner did say a word.
    expect(wrong?.score).toBeGreaterThanOrEqual(20);
  });

  it('never scores a spoken word below twenty, so one slip is not a zero', () => {
    const result = say('cat', 'dog');
    expect(result.words[0]?.score).toBe(20);
  });

  it('collects words that were not in the reference without punishing accuracy', () => {
    const clean = say('I am ready', 'I am ready');
    const chatty = say('I am ready', 'I am ready now definitely');
    expect(chatty.extraWords).toEqual(['now', 'definitely']);
    expect(chatty.scores.accuracy).toBe(clean.scores.accuracy);
  });

  it('treats fillers as a fluency cost, not an accuracy cost', () => {
    const clean = say('I would like a coffee', 'I would like a coffee');
    const hesitant = say('I would like a coffee', 'uh I would um like a coffee');
    expect(hesitant.scores.accuracy).toBe(clean.scores.accuracy);
    expect(hesitant.scores.fluency).toBeLessThan(clean.scores.fluency);
  });

  it('lists the fillers it knows about', () => {
    expect(FILLERS).toContain('um');
    expect(FILLERS).toContain('uh');
  });

  it('reports words per minute from the real duration', () => {
    // Six words in exactly one minute.
    const result = scoreSpeech({
      reference: 'one two three four five six',
      transcript: 'one two three four five six',
      durationMs: 60_000,
      cefr: 'B1',
    });
    expect(result.wpm).toBe(6);
  });

  it('penalises speaking far too slowly', () => {
    const normal = say('I would like to book a table for two', 'I would like to book a table for two', 4000);
    const crawling = say('I would like to book a table for two', 'I would like to book a table for two', 30_000);
    expect(crawling.scores.fluency).toBeLessThan(normal.scores.fluency);
  });

  it('reports prosody as null rather than inventing a number', () => {
    // Nothing in this pipeline measures intonation (D-051).
    expect(say('hello there', 'hello there').prosody).toBeNull();
  });

  it('handles silence: nothing heard at all', () => {
    const result = say('I want to go home', '');
    expect(result.scores.accuracy).toBe(0);
    expect(result.scores.completeness).toBe(0);
    expect(result.words.every((word) => word.errorType === 'Omission')).toBe(true);
    expect(result.overall).toBeLessThan(30);
  });

  it('handles an empty reference without crashing', () => {
    const result = say('', 'anything at all');
    expect(result.words).toHaveLength(0);
    expect(result.scores.accuracy).toBe(0);
  });
});

describe('overallWithoutProsody', () => {
  it('returns a hundred when the three measured scores are perfect', () => {
    expect(
      overallWithoutProsody({ accuracy: 100, fluency: 100, completeness: 100, prosody: 0 }),
    ).toBe(100);
  });

  it('does not let an unmeasured prosody drag the total down', () => {
    // The §9.3 weighting would give 85 here purely because prosody is zero.
    const scores = { accuracy: 100, fluency: 100, completeness: 100, prosody: 0 };
    expect(overallWithoutProsody(scores)).toBe(100);
  });

  it('weights accuracy most heavily, as §9.3 does', () => {
    const strongAccuracy = overallWithoutProsody({
      accuracy: 100,
      fluency: 50,
      completeness: 50,
      prosody: 0,
    });
    const strongFluency = overallWithoutProsody({
      accuracy: 50,
      fluency: 100,
      completeness: 50,
      prosody: 0,
    });
    expect(strongAccuracy).toBeGreaterThan(strongFluency);
  });

  it('returns zero for a silent attempt', () => {
    expect(overallWithoutProsody({ accuracy: 0, fluency: 0, completeness: 0, prosody: 0 })).toBe(0);
  });
});
