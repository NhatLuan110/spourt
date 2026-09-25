import { Fragment } from 'react';
import { WordAudio } from '@/components/domain/word-audio';

export interface ExampleSentenceProps {
  example: { textEn: string; textVi: string; highlightStart: number; highlightEnd: number };
  withAudio?: boolean;
}

/**
 * §12.1 — every example marks where the target word sits so it can be bolded.
 * The offsets come from the seed, which resolves inflected forms, so "browsing"
 * is highlighted for the lemma "browse".
 */
export function ExampleSentence({ example, withAudio = true }: ExampleSentenceProps) {
  const { textEn, highlightStart, highlightEnd } = example;
  const valid = highlightEnd > highlightStart && highlightEnd <= textEn.length;

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[15px]">
        {valid ? (
          <Fragment>
            {textEn.slice(0, highlightStart)}
            <strong className="font-semibold text-[var(--primary)]">
              {textEn.slice(highlightStart, highlightEnd)}
            </strong>
            {textEn.slice(highlightEnd)}
          </Fragment>
        ) : (
          textEn
        )}
        {withAudio ? (
          <WordAudio className="ml-2 align-middle" size="sm" text={textEn} />
        ) : null}
      </p>
      <p className="text-[14px] text-[var(--text-muted)]">{example.textVi}</p>
    </div>
  );
}
