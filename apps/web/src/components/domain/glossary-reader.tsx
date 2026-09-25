'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { POS_SHORT } from '@sprout/shared';
import type { GlossaryEntry, PartOfSpeech } from '@sprout/shared';
import { Badge } from '@/components/ui/badge';
import { WordAudio } from '@/components/domain/word-audio';
import { cn } from '@/lib/utils';

export interface GlossaryReaderProps {
  body: string;
  glossary: GlossaryEntry[];
}

interface Piece {
  text: string;
  entry: GlossaryEntry | null;
  key: string;
}

/**
 * Renders the passage with the glossary words made tappable.
 *
 * The server sends character offsets rather than a list of words to search for,
 * so the reader never has to re-tokenise the text and cannot highlight the
 * wrong occurrence of a common word.
 */
export function GlossaryReader({ body, glossary }: GlossaryReaderProps) {
  const t = useTranslations();
  const [open, setOpen] = useState<GlossaryEntry | null>(null);

  const paragraphs = useMemo(() => splitIntoParagraphs(body, glossary), [body, glossary]);

  return (
    <div className="relative">
      <article className="flex flex-col gap-4 text-[17px] leading-[1.75] text-[var(--text)]">
        {paragraphs.map((pieces, index) => (
          <p key={`para-${index}`}>
            {pieces.map((piece) =>
              piece.entry ? (
                <button
                  key={piece.key}
                  type="button"
                  onClick={() => setOpen(piece.entry)}
                  className={cn(
                    'rounded-[var(--r-sm)] px-0.5 underline decoration-dotted underline-offset-4',
                    piece.entry.known
                      ? 'decoration-[var(--success)]'
                      : 'bg-[var(--accent-soft)] decoration-[var(--accent)]',
                  )}
                >
                  {piece.text}
                </button>
              ) : (
                <Fragment key={piece.key}>{piece.text}</Fragment>
              ),
            )}
          </p>
        ))}
      </article>

      {open ? (
        <div
          role="dialog"
          aria-label={t('reading.glossaryTitle')}
          className="sticky bottom-4 mt-6 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[20px] font-semibold">{open.lemma}</span>
            {open.ipa ? <span className="ipa text-[14px]">{open.ipa}</span> : null}
            <WordAudio text={open.lemma} urlUs={null} />
            {open.pos ? (
              <Badge tone="primary">{POS_SHORT[open.pos as PartOfSpeech] ?? open.pos}</Badge>
            ) : null}
            {open.known ? <Badge tone="success">{t('reading.alreadyKnown')}</Badge> : null}
          </div>

          <p className="mt-2 text-[15px] text-[var(--text-muted)]">
            {open.definitionVi || t('reading.noDefinition')}
          </p>

          <div className="mt-3 flex items-center gap-3">
            {open.wordId ? (
              <Link
                href={`/word/${open.lemma}`}
                className="text-[14px] text-[var(--primary)] underline"
              >
                {t('reading.openWord')}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="ml-auto text-[14px] text-[var(--text-muted)]"
            >
              {t('reading.close')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cuts the body at the glossary offsets, then splits the result on blank lines
 * so paragraphs survive. Offsets are absolute into the body, so the slicing is
 * done first and the paragraph break is detected inside each plain piece.
 */
export function splitIntoParagraphs(body: string, glossary: GlossaryEntry[]): Piece[][] {
  const sorted = [...glossary]
    .filter((entry) => entry.offsetEnd > entry.offsetStart)
    .sort((a, b) => a.offsetStart - b.offsetStart);

  const flat: Piece[] = [];
  let cursor = 0;
  for (const [index, entry] of sorted.entries()) {
    // Overlapping entries would double-render the text; the later one is
    // dropped rather than allowed to corrupt the passage.
    if (entry.offsetStart < cursor) continue;
    if (entry.offsetStart > cursor) {
      flat.push({ text: body.slice(cursor, entry.offsetStart), entry: null, key: `t-${index}` });
    }
    flat.push({
      text: body.slice(entry.offsetStart, entry.offsetEnd),
      entry,
      key: `g-${entry.lemma}-${entry.offsetStart}`,
    });
    cursor = entry.offsetEnd;
  }
  if (cursor < body.length) {
    flat.push({ text: body.slice(cursor), entry: null, key: 't-last' });
  }

  const paragraphs: Piece[][] = [[]];
  for (const piece of flat) {
    if (piece.entry) {
      paragraphs[paragraphs.length - 1]?.push(piece);
      continue;
    }
    const chunks = piece.text.split(/\n\s*\n/);
    chunks.forEach((chunk, position) => {
      if (position > 0) paragraphs.push([]);
      const collapsed = chunk.replace(/\s+/g, ' ');
      if (collapsed.length === 0) return;
      paragraphs[paragraphs.length - 1]?.push({
        text: collapsed,
        entry: null,
        key: `${piece.key}-${position}`,
      });
    });
  }

  return paragraphs.filter((pieces) => pieces.length > 0);
}
