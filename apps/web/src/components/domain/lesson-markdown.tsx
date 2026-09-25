import { Fragment, type ReactNode } from 'react';

/**
 * Renders the Markdown subset the lesson content actually uses — headings,
 * paragraphs, bullet and numbered lists, tables, and inline bold, italic and
 * code — as React elements.
 *
 * A full Markdown library would be a dependency and, more to the point, would
 * arrive with raw-HTML support that we would then have to switch off. Nothing
 * here ever produces HTML from a string, so `dangerouslySetInnerHTML` never
 * appears and lesson prose cannot inject markup (D-034).
 */

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const TABLE_DIVIDER = /^\|?[\s:|-]+\|[\s:|-]*$/;

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]?.length === 2 ? 2 : 3,
        text: heading[2] ?? '',
      });
      index += 1;
      continue;
    }

    // A table is a header row, a divider of dashes, then body rows.
    if (trimmed.startsWith('|') && TABLE_DIVIDER.test(lines[index + 1]?.trim() ?? '')) {
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index]?.trim() ?? '').startsWith('|')) {
        rows.push(splitRow(lines[index]?.trim() ?? ''));
        index += 1;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      const ordered = numbered !== null && bullet === null;
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index] ?? '';
        const candidateTrimmed = candidate.trim();
        const nextBullet = ordered
          ? /^\d+\.\s+(.*)$/.exec(candidateTrimmed)
          : /^[-*]\s+(.*)$/.exec(candidateTrimmed);
        if (nextBullet) {
          items.push(nextBullet[1] ?? '');
          index += 1;
          continue;
        }
        // An indented line continues the item above rather than starting a
        // paragraph, which is how the bilingual example lines are written.
        if (candidateTrimmed.length > 0 && candidate.startsWith('  ') && items.length > 0) {
          items[items.length - 1] = `${items.at(-1) ?? ''} ${candidateTrimmed}`;
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index]?.trim() ?? '';
      if (
        candidate.length === 0 ||
        candidate.startsWith('|') ||
        /^[-*]\s+/.test(candidate) ||
        /^\d+\.\s+/.test(candidate) ||
        /^#{2,3}\s+/.test(candidate)
      ) {
        break;
      }
      paragraph.push(candidate);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }

  return blocks;
}

/** Inline `**bold**`, `*italic*` and `` `code` ``, applied left to right. */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(pattern).filter((part) => part.length > 0);

  return parts.map((part, position) => {
    const key = `${keyPrefix}-${position}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-[var(--text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={key}
          className="rounded-[var(--r-sm)] bg-[var(--surface-alt)] px-1.5 py-0.5 font-mono text-[13px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={key} className="text-[var(--text-muted)]">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function LessonMarkdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);

  return (
    <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-[var(--text)]">
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        switch (block.kind) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={key} className="text-[20px] font-semibold">
                {renderInline(block.text, key)}
              </h2>
            ) : (
              <h3 key={key} className="text-[17px] font-semibold">
                {renderInline(block.text, key)}
              </h3>
            );
          case 'list':
            return block.ordered ? (
              <ol key={key} className="ml-5 flex list-decimal flex-col gap-1.5">
                {block.items.map((item, position) => (
                  <li key={`${key}-${position}`}>{renderInline(item, `${key}-${position}`)}</li>
                ))}
              </ol>
            ) : (
              <ul key={key} className="ml-5 flex list-disc flex-col gap-1.5">
                {block.items.map((item, position) => (
                  <li key={`${key}-${position}`}>{renderInline(item, `${key}-${position}`)}</li>
                ))}
              </ul>
            );
          case 'table':
            return (
              <div key={key} className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[14px]">
                  <thead>
                    <tr>
                      {block.header.map((cell, position) => (
                        <th
                          key={`${key}-h-${position}`}
                          scope="col"
                          className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                        >
                          {renderInline(cell, `${key}-h-${position}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${key}-r-${rowIndex}`} className="align-top">
                        {row.map((cell, position) => (
                          <td
                            key={`${key}-r-${rowIndex}-${position}`}
                            className="border-b border-[var(--border)] px-3 py-2"
                          >
                            {renderInline(cell, `${key}-r-${rowIndex}-${position}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={key}>
                {block.lines.map((line, position) => (
                  <Fragment key={`${key}-${position}`}>
                    {position > 0 ? ' ' : null}
                    {renderInline(line, `${key}-${position}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
