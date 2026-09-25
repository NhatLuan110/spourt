import { describe, expect, it } from 'vitest';
import { buildTurns, titleFrom } from '@app/modules/tutor/tutor.service';

/**
 * The turn ordering decides which sentence the tutor answers about, so it is
 * tested here. The live conversation runs in scripts/demo-p3-tutor.ts.
 */

const history = (...contents: { role: string; content: string }[]) => contents;

describe('buildTurns', () => {
  it('replays oldest first, because the database returns newest first', () => {
    const turns = buildTurns(
      history(
        { role: 'user', content: 'câu ba' },
        { role: 'assistant', content: 'đáp hai' },
        { role: 'user', content: 'câu một' },
      ),
    );
    expect(turns.map((turn) => turn.content)).toEqual(['câu một', 'đáp hai', 'câu ba']);
  });

  it('maps roles onto the two the provider accepts', () => {
    const turns = buildTurns(
      history({ role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }),
    );
    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant']);
  });

  it('attaches the context to the current question, not the front of the thread', () => {
    const turns = buildTurns(
      history(
        { role: 'user', content: 'Tại sao câu này sai?' },
        { role: 'assistant', content: 'trả lời cũ' },
        { role: 'user', content: 'câu hỏi cũ' },
      ),
      { kind: 'exercise', ref: 'gr_present-simple_1', excerpt: 'She go to school.' },
    );

    // The last turn is the one the model reads closest to its answer.
    const current = turns.at(-1);
    expect(current?.content).toContain('She go to school.');
    expect(current?.content).toContain('Tại sao câu này sai?');
    // Nothing earlier carries it, which is what made the model answer about
    // the previous exchange instead.
    expect(turns.slice(0, -1).some((turn) => turn.content.includes('She go'))).toBe(false);
  });

  it('keeps the question readable below the context', () => {
    const turns = buildTurns(history({ role: 'user', content: 'Vì sao?' }), {
      kind: 'word',
      ref: 'recycle',
    });
    expect(turns[0]?.content.endsWith('Vì sao?')).toBe(true);
  });

  it('leaves the turns alone when there is no context', () => {
    const turns = buildTurns(history({ role: 'user', content: 'xin chào' }));
    expect(turns).toEqual([{ role: 'user', content: 'xin chào' }]);
  });

  it('does not mutate the array it was given', () => {
    const rows = history({ role: 'user', content: 'a' }, { role: 'user', content: 'b' });
    const before = rows.map((row) => row.content);
    buildTurns(rows);
    expect(rows.map((row) => row.content)).toEqual(before);
  });

  it('handles an empty history without crashing', () => {
    expect(buildTurns([], { kind: 'word', ref: 'x' })).toEqual([]);
  });

  it('names the context by kind, in Vietnamese', () => {
    const turns = buildTurns(history({ role: 'user', content: 'q' }), {
      kind: 'listening',
      ref: 'a-doctors-appointment',
    });
    expect(turns[0]?.content).toContain('bài nghe');
    expect(turns[0]?.content).toContain('a-doctors-appointment');
  });
});

describe('titleFrom', () => {
  it('uses the first question as the conversation name', () => {
    expect(titleFrom('Khi nào dùng have been?')).toBe('Khi nào dùng have been?');
  });

  it('takes only the first line', () => {
    expect(titleFrom('Câu hỏi\nDòng thứ hai')).toBe('Câu hỏi');
  });

  it('truncates a long question with an ellipsis', () => {
    const title = titleFrom('x'.repeat(200));
    expect(title.length).toBe(58);
    expect(title.endsWith('…')).toBe(true);
  });

  it('handles an empty message', () => {
    expect(titleFrom('   ')).toBe('');
  });
});
