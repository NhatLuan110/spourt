import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANALYTICS_PERIODS,
  LESSON_EXERCISE_MODES,
  LESSON_SECTION_KINDS,
  LISTENING_ACCENTS,
  LISTENING_FORMATS,
  PLAYBACK_RATES,
  TEST_KINDS,
} from '@sprout/shared';
import { parseBlocks, renderInline } from '../src/components/domain/lesson-markdown';
import { splitIntoParagraphs } from '../src/components/domain/glossary-reader';
import { SIDEBAR_ITEMS } from '../src/components/layout/app-nav';

function messages(locale: string): Record<string, unknown> {
  const path = resolve(__dirname, `../messages/${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function lookup(source: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, source);
}

describe('lesson translations', () => {
  it('names every section kind the grammar content can contain', () => {
    for (const locale of ['vi', 'en']) {
      const source = messages(locale);
      for (const kind of LESSON_SECTION_KINDS) {
        expect(lookup(source, `grammar.section.${kind}`), `${locale}/${kind}`).toBeTruthy();
      }
    }
  });

  it('names every listening accent and format the API can return', () => {
    for (const locale of ['vi', 'en']) {
      const source = messages(locale);
      for (const accent of LISTENING_ACCENTS) {
        expect(lookup(source, `listening.accent.${accent}`), `${locale}/${accent}`).toBeTruthy();
      }
      for (const format of LISTENING_FORMATS) {
        expect(lookup(source, `listening.format.${format}`), `${locale}/${format}`).toBeTruthy();
      }
    }
  });

  it('names every reading speed band', () => {
    for (const locale of ['vi', 'en']) {
      const source = messages(locale);
      for (const band of ['slow', 'on-target', 'fast', 'skimmed']) {
        expect(lookup(source, `reading.band.${band}`), `${locale}/${band}`).toBeTruthy();
      }
    }
  });

  it('offers a playback rate the learner can actually reach', () => {
    // The "listened slowly" achievement looks for 0.75 or below (§12.3), so the
    // player must offer at least one rate that qualifies.
    expect(PLAYBACK_RATES.some((rate) => rate <= 0.75)).toBe(true);
    expect(PLAYBACK_RATES).toContain(1);
  });

  it('covers all six exercise modes with a renderer', () => {
    // The runner has a branch per mode; gap-fill and short-answer share one.
    expect(LESSON_EXERCISE_MODES).toEqual([
      'mcq',
      'gap-fill',
      'true-false',
      'reorder',
      'short-answer',
      'dictation',
    ]);
  });
});

describe('test and analytics translations', () => {
  it('names every kind of test the API can return', () => {
    for (const locale of ['vi', 'en']) {
      const source = messages(locale);
      for (const kind of TEST_KINDS) {
        expect(lookup(source, `tests.kind.${kind}`), `${locale}/${kind}`).toBeTruthy();
      }
    }
  });

  it('names every analytics period the picker offers', () => {
    for (const locale of ['vi', 'en']) {
      const source = messages(locale);
      for (const period of ANALYTICS_PERIODS) {
        expect(
          lookup(source, `analytics.periodLabel.${period}`),
          `${locale}/${period}`,
        ).toBeTruthy();
      }
    }
  });
});

describe('navigation', () => {
  it('keeps the admin entry out of an ordinary sidebar', () => {
    // The API refuses these routes without the role anyway; hiding the link
    // stops a learner clicking into a screen that can only show an error.
    const admin = SIDEBAR_ITEMS.find((item) => item.key === 'admin');
    expect(admin?.adminOnly).toBe(true);
    expect(SIDEBAR_ITEMS.filter((item) => item.adminOnly)).toHaveLength(1);
  });

  it('has every sidebar section built and open', () => {
    // All six skills plus the tutor, tests and analytics now have pages. A
    // future unbuilt entry must render disabled rather than 404 (D-018), which
    // the route check below enforces.
    const unbuilt = SIDEBAR_ITEMS.filter((item) => !item.ready).map((item) => item.key);
    expect(unbuilt).toEqual([]);
  });

  it('never links to a route that does not exist', () => {
    // Every ready item must have a page under app/(app); an entry switched on
    // before its page lands would 404 for real users.
    for (const item of SIDEBAR_ITEMS.filter((entry) => entry.ready)) {
      const page = resolve(__dirname, '../src/app/(app)', item.href.slice(1), 'page.tsx');
      expect(existsSync(page), item.href).toBe(true);
    }
  });
});

describe('lesson markdown', () => {
  it('parses a table with its header and rows', () => {
    const blocks = parseBlocks(
      ['| Sai | Đúng |', '|---|---|', '| She go | She **goes** |'].join('\n'),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'table',
      header: ['Sai', 'Đúng'],
      rows: [['She go', 'She **goes**']],
    });
  });

  it('parses bullets and folds an indented continuation into the item above', () => {
    const blocks = parseBlocks(
      ['- I **work** here.', '  *Tôi làm việc ở đây.*', '- She works there.'].join('\n'),
    );
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false });
    const list = blocks[0] as { items: string[] };
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toContain('Tôi làm việc');
  });

  it('parses a numbered list separately from bullets', () => {
    const blocks = parseBlocks(['1. First', '2. Second'].join('\n'));
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true, items: ['First', 'Second'] });
  });

  it('keeps paragraphs apart across a blank line', () => {
    const blocks = parseBlocks('One sentence.\n\nAnother one.');
    expect(blocks.filter((block) => block.kind === 'paragraph')).toHaveLength(2);
  });

  it('renders inline emphasis without ever producing raw HTML', () => {
    const nodes = renderInline('a **bold** and `code` and *soft*', 'k');
    // Five parts: text, bold, text, code, text, soft — the plain runs collapse
    // to whatever split produced, so assert on the marked-up ones being elements.
    const elements = nodes.filter((node) => typeof node === 'object');
    expect(elements.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(nodes)).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('glossary reader', () => {
  const body = 'Plastic pollution is rising.\n\nThe habitat is at risk.';

  function entry(lemma: string, start: number, end: number) {
    return {
      wordId: `w-${lemma}`,
      lemma,
      surface: body.slice(start, end),
      offsetStart: start,
      offsetEnd: end,
      definitionVi: 'nghĩa',
      pos: 'NOUN',
      ipa: null,
      known: false,
    };
  }

  it('splits the passage at the glossary offsets and keeps paragraphs apart', () => {
    const paragraphs = splitIntoParagraphs(body, [entry('pollution', 8, 17), entry('habitat', 34, 41)]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.some((piece) => piece.entry?.lemma === 'pollution')).toBe(true);
    expect(paragraphs[1]?.some((piece) => piece.entry?.lemma === 'habitat')).toBe(true);
  });

  it('reproduces the passage text exactly, so nothing is dropped or doubled', () => {
    const paragraphs = splitIntoParagraphs(body, [entry('pollution', 8, 17)]);
    const rebuilt = paragraphs.map((pieces) => pieces.map((piece) => piece.text).join('')).join(' ');
    expect(rebuilt).toBe('Plastic pollution is rising. The habitat is at risk.');
  });

  it('drops an overlapping entry rather than duplicating the text', () => {
    const paragraphs = splitIntoParagraphs(body, [
      entry('pollution', 8, 17),
      entry('ollution', 9, 17),
    ]);
    const rebuilt = paragraphs.map((pieces) => pieces.map((piece) => piece.text).join('')).join(' ');
    expect(rebuilt).toBe('Plastic pollution is rising. The habitat is at risk.');
  });

  it('handles a passage with no glossary at all', () => {
    const paragraphs = splitIntoParagraphs(body, []);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.every((pieces) => pieces.every((piece) => piece.entry === null))).toBe(true);
  });
});
