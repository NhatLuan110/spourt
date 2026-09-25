'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PLAYBACK_RATES } from '@sprout/shared';
import type { ListeningPlayback, TranscriptSegmentView } from '@sprout/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { speak, speechSupported } from '@/lib/speech';
import { cn } from '@/lib/utils';

export interface TranscriptPlayerProps {
  transcript: TranscriptSegmentView[];
  accent: 'US' | 'UK' | 'AU';
  /** Empty until a TTS provider is configured (D-033). */
  audioUrl: string;
  onPlaybackChange: (playback: ListeningPlayback) => void;
}

/**
 * D-033 — with no recorded audio, the player speaks the transcript one segment
 * at a time and advances when the browser reports the utterance finished. That
 * gives real segment-level highlighting rather than a timer pretending to
 * follow an audio file that does not exist.
 *
 * When `audioUrl` is set the same component plays the file and follows the
 * seeded timings instead, so the UI does not change when audio arrives.
 */
export function TranscriptPlayer({
  transcript,
  accent,
  audioUrl,
  onPlaybackChange,
}: TranscriptPlayerProps) {
  const t = useTranslations();
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [showTranscript, setShowTranscript] = useState(false);
  const [replays, setReplays] = useState(0);
  const [supported, setSupported] = useState(true);

  const audio = useRef<HTMLAudioElement | null>(null);
  // A ref, because the playback loop reads it after each utterance and must not
  // be re-created every time the state changes.
  const stopped = useRef(false);

  useEffect(() => {
    setSupported(audioUrl.length > 0 || speechSupported());
  }, [audioUrl]);

  useEffect(() => {
    onPlaybackChange({ playbackRate: rate, replays, transcriptShown: showTranscript });
  }, [rate, replays, showTranscript, onPlaybackChange]);

  const stop = useCallback(() => {
    stopped.current = true;
    setPlaying(false);
    setActiveOrder(null);
    if (audio.current) audio.current.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => stop, [stop]);

  /** Speaks from `fromOrder` to the end, one segment at a time. */
  const playFrom = useCallback(
    (fromOrder: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      stopped.current = false;
      setPlaying(true);

      const queue = transcript.filter((segment) => segment.order >= fromOrder);
      let position = 0;

      const next = () => {
        if (stopped.current || position >= queue.length) {
          setPlaying(false);
          setActiveOrder(null);
          return;
        }
        const segment = queue[position];
        position += 1;
        if (!segment) {
          next();
          return;
        }
        setActiveOrder(segment.order);
        speak(segment.text, accent === 'UK' ? 'uk' : 'us', rate, next);
      };

      window.speechSynthesis.cancel();
      next();
    },
    [transcript, accent, rate],
  );

  function replaySegment(order: number) {
    setReplays((count) => count + 1);
    const segment = transcript.find((entry) => entry.order === order);
    if (!segment) return;
    stopped.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveOrder(order);
    speak(segment.text, accent === 'UK' ? 'uk' : 'us', rate, () => setActiveOrder(null));
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={playing ? 'secondary' : 'primary'}
            disabled={!supported}
            onClick={() => (playing ? stop() : playFrom(transcript[0]?.order ?? 1))}
          >
            {playing ? t('listening.pause') : t('listening.play')}
          </Button>

          <div
            role="group"
            aria-label={t('listening.speed')}
            className="flex items-center gap-1"
          >
            {PLAYBACK_RATES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={rate === option}
                onClick={() => setRate(option)}
                className={cn(
                  'rounded-[var(--r-sm)] border px-2.5 py-1 text-[13px]',
                  rate === option
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]',
                )}
              >
                {option}x
              </button>
            ))}
          </div>

          <Button variant="ghost" onClick={() => setShowTranscript((shown) => !shown)}>
            {showTranscript ? t('listening.hideTranscript') : t('listening.showTranscript')}
          </Button>
        </div>

        {audioUrl.length === 0 ? (
          <p className="text-[13px] text-[var(--text-subtle)]">
            {supported ? t('listening.synthesisNotice') : t('listening.noAudioSupport')}
          </p>
        ) : (
          // The transcript below is the caption, and it is richer than a track
          // file: it is per speaker, translated, and clickable to replay a line.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio ref={audio} src={audioUrl} controls className="w-full" />
        )}

        {showTranscript ? (
          <ol className="flex flex-col gap-2">
            {transcript.map((segment) => (
              <li key={segment.id}>
                <button
                  type="button"
                  onClick={() => replaySegment(segment.order)}
                  aria-current={activeOrder === segment.order}
                  className={cn(
                    'w-full rounded-[var(--r-md)] border p-3 text-left transition-colors',
                    activeOrder === segment.order
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                      : 'border-transparent hover:bg-[var(--surface-alt)]',
                  )}
                >
                  {segment.speaker ? (
                    <Badge tone="neutral" className="mb-1">
                      {segment.speaker}
                    </Badge>
                  ) : null}
                  <p className="text-[16px] leading-relaxed">{segment.text}</p>
                  {segment.translationVi ? (
                    <p className="mt-1 text-[14px] text-[var(--text-muted)]">
                      {segment.translationVi}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[14px] text-[var(--text-muted)]">
            {activeOrder === null
              ? t('listening.transcriptHidden')
              : t('listening.nowPlaying', { number: activeOrder })}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
