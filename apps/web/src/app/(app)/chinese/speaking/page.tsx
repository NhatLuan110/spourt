'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HSK_LEVEL_LIST } from '@sprout/shared';
import type { HskLevel } from '@sprout/shared';
import { chineseApi, chineseKeys } from '@/lib/chinese-api';
import {
  hasChineseVoice,
  listenOnce,
  recognitionSupported,
  scorePronunciation,
  speakChinese,
  ttsSupported,
} from '@/lib/chinese-speech';
import type { PronunciationResult } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'listening' | 'scored' | 'error';

/**
 * Tập phát âm: nghe mẫu, tự đọc vào micro, máy chấm từng chữ.
 *
 * Chấm bằng cách so chữ Hán máy nghe được với chữ đích, không so pinyin. Bộ
 * nhận dạng trả về chữ, mà đọc sai thanh thì nó nghe ra chữ khác — đúng cái lỗi
 * cần bắt ở người Việt mới học.
 */
export default function ChineseSpeakingPage() {
  const [hsk, setHsk] = useState<HskLevel>('HSK1');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [support, setSupport] = useState({ tts: true, voice: true, mic: true });

  useEffect(() => {
    // Chỉ kiểm tra được ở phía trình duyệt, và giọng nạp trễ nên đợi một nhịp.
    const check = () =>
      setSupport({ tts: ttsSupported(), voice: hasChineseVoice(), mic: recognitionSupported() });
    check();
    const timer = setTimeout(check, 700);
    return () => clearTimeout(timer);
  }, []);

  const words = useQuery({
    queryKey: chineseKeys.words(hsk, { page: 1, sort: 'frequency', drill: 'speaking' }),
    queryFn: () => chineseApi.words(hsk, { page: 1, limit: 40, sort: 'frequency' }),
  });

  const list = words.data?.data ?? [];
  const current = list[index];

  const record = useCallback(async () => {
    if (!current) return;
    setPhase('listening');
    setMessage(null);
    setResult(null);
    try {
      const heard = await listenOnce();
      setResult(scorePronunciation(current.simplified, heard));
      setPhase('scored');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không ghi được.');
      setPhase('error');
    }
  }, [current]);

  const next = () => {
    setIndex((value) => (list.length === 0 ? 0 : (value + 1) % list.length));
    setPhase('idle');
    setResult(null);
    setMessage(null);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
          Tập phát âm
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">
          Nghe mẫu, đọc lại vào micro, máy chấm từng chữ. Đọc sai thanh thì máy nghe ra chữ
          khác — đó chính là lỗi cần sửa.
        </p>
      </header>

      <div className="flex flex-wrap gap-1">
        {HSK_LEVEL_LIST.map((level) => (
          <button
            key={level.key}
            type="button"
            onClick={() => {
              setHsk(level.key);
              setIndex(0);
              setPhase('idle');
              setResult(null);
            }}
            className={cn(
              'rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium transition-colors',
              hsk === level.key
                ? 'bg-[var(--primary)] text-[var(--text-inverse)]'
                : 'bg-[var(--surface-alt)] text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            HSK {level.number}
          </button>
        ))}
      </div>

      {!support.mic || !support.voice ? (
        <div className="rounded-[var(--r-md)] bg-[var(--warning-soft)] p-4 text-[14px] text-[var(--warning)]">
          {!support.mic
            ? 'Trình duyệt này không nhận dạng được giọng nói. Dùng Microsoft Edge hoặc Chrome để chấm phát âm.'
            : 'Máy chưa có giọng đọc tiếng Trung. Cài gói giọng nói tiếng Trung trong Cài đặt Windows để nghe được mẫu.'}
        </div>
      ) : null}

      {words.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : !current ? (
        <p className="text-[15px] text-[var(--text-muted)]">Không có từ nào ở cấp này.</p>
      ) : (
        <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-[13px] text-[var(--text-subtle)]">
            Từ {index + 1} / {list.length}
          </p>

          <p className="hanzi mt-3 text-[64px] leading-none">{current.simplified}</p>
          <p className="mt-3 text-[22px] font-medium text-[var(--primary)]">{current.pinyin}</p>
          <p className="text-[16px] text-[var(--text)]">{current.meaningVi}</p>
          {current.hanViet ? (
            <p className="text-[14px] text-[var(--text-muted)]">Hán Việt: {current.hanViet}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => speakChinese(current.simplified, { rate: 0.75 })}
              disabled={!support.tts}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-strong)] px-4 text-[15px] font-medium disabled:opacity-50"
            >
              <Icon name="listening" /> Nghe chậm
            </button>
            <button
              type="button"
              onClick={() => speakChinese(current.simplified, { rate: 1 })}
              disabled={!support.tts}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-strong)] px-4 text-[15px] font-medium disabled:opacity-50"
            >
              <Icon name="listening" /> Tốc độ thường
            </button>
            <button
              type="button"
              onClick={() => void record()}
              disabled={!support.mic || phase === 'listening'}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[15px] font-semibold text-[var(--text-inverse)] disabled:opacity-50"
            >
              <Icon name="speaking" />
              {phase === 'listening' ? 'Đang nghe…' : 'Đọc và chấm'}
            </button>
            <button
              type="button"
              onClick={next}
              className="ml-auto inline-flex h-11 items-center rounded-[var(--r-md)] px-4 text-[15px] text-[var(--text-muted)] hover:bg-[var(--surface-alt)]"
            >
              Từ tiếp theo
            </button>
          </div>

          {phase === 'error' && message ? (
            <p className="mt-4 rounded-[var(--r-sm)] bg-[var(--danger-soft)] p-3 text-[14px] text-[var(--danger)]">
              {message}
            </p>
          ) : null}

          {phase === 'scored' && result ? <ScoreCard result={result} /> : null}
        </section>
      )}
    </div>
  );
}

function ScoreCard({ result }: { result: PronunciationResult }) {
  const tone =
    result.score >= 85 ? 'success' : result.score >= 55 ? 'warning' : 'danger';
  const verdict =
    result.score >= 85
      ? 'Chuẩn rồi, đọc tiếp từ sau.'
      : result.score >= 55
        ? 'Gần đúng. Nghe lại mẫu rồi đọc chậm hơn.'
        : 'Chưa khớp. Nghe mẫu vài lần, chú ý thanh điệu.';

  return (
    <div
      className="mt-5 rounded-[var(--r-md)] p-4"
      style={{ backgroundColor: `color-mix(in oklab, var(--${tone}) 12%, var(--surface))` }}
    >
      <div className="flex items-baseline gap-3">
        <span className="tabular text-[34px] font-bold" style={{ color: `var(--${tone})` }}>
          {result.score}
        </span>
        <span className="text-[15px] text-[var(--text)]">{verdict}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {result.perCharacter.map((item, position) => (
          <span
            key={`${item.character}-${position}`}
            className="hanzi rounded-[var(--r-sm)] px-2.5 py-1 text-[26px] leading-none"
            style={{
              backgroundColor: `color-mix(in oklab, var(--${item.correct ? 'success' : 'danger'}) 16%, transparent)`,
              color: `var(--${item.correct ? 'success' : 'danger'})`,
            }}
            title={item.correct ? 'Đọc đúng' : 'Chưa nghe ra chữ này'}
          >
            {item.character}
          </span>
        ))}
      </div>

      <p className="mt-3 text-[13px] text-[var(--text-muted)]">
        Máy nghe được: <span className="hanzi text-[15px] text-[var(--text)]">{result.heard || '—'}</span>
      </p>
    </div>
  );
}
