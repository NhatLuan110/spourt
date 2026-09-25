'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { TutorReply } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { speakChinese } from '@/lib/chinese-speech';
import { Icon } from '@/components/ui/icon';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  '了 và 过 khác nhau chỗ nào?',
  'Khi nào dùng 会, khi nào dùng 能?',
  'Đặt cho tôi 5 câu ví dụ với 把',
  'Vì sao 我是高 lại sai?',
  '这 và 那 dùng thế nào cho đúng?',
];

/**
 * Gia sư AI cho ngăn tiếng Trung.
 *
 * D-109 — dùng lại đúng endpoint `/tutor/ask` của ngăn tiếng Anh thay vì dựng
 * một đường AI thứ hai: hạn mức, ghi log và khoá API của người học đều đã nằm ở
 * đó, tách ra là phải chép lại cả ba. Câu hỏi được gắn thêm một dòng nêu rõ đây
 * là câu hỏi tiếng Trung, vì lời nhắc gốc của gia sư viết cho người học tiếng Anh.
 */
export default function ChineseTutorPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (message: string) =>
      api.post<TutorReply>('/tutor/ask', {
        conversationId,
        message: `[Câu hỏi về TIẾNG TRUNG — HSK, chữ Hán, pinyin, ngữ pháp tiếng Trung. Trả lời bằng tiếng Việt, ví dụ viết bằng chữ Hán kèm pinyin.]\n\n${message}`,
      }),
    onSuccess: (reply) => {
      setConversationId(reply.conversationId);
      setTurns((value) => [...value, { role: 'assistant', content: reply.reply.content }]);
      setError(null);
    },
    onError: (failure) => {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'Không hỏi được gia sư. Thử lại sau ít phút.',
      );
    },
  });

  const send = (message: string) => {
    const text = message.trim();
    if (!text || ask.isPending) return;
    setTurns((value) => [...value, { role: 'user', content: text }]);
    setDraft('');
    ask.mutate(text);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] leading-tight">
          Gia sư AI tiếng Trung
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">
          Hỏi bất cứ điều gì về chữ Hán, pinyin hay ngữ pháp. Trả lời bằng tiếng Việt, ví dụ
          kèm chữ Hán và pinyin.
        </p>
      </header>

      {turns.length === 0 ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-[15px] font-medium">Chưa biết hỏi gì? Thử mấy câu này:</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-[var(--r-full)] border border-[var(--border-strong)] px-3 py-1.5 text-[14px] hover:bg-[var(--surface-alt)]"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="space-y-3">
          {turns.map((turn, index) => (
            <li
              key={index}
              className={
                turn.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-[var(--r-lg)] bg-[var(--primary-soft)] p-4'
                  : 'max-w-[92%] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4'
              }
            >
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{turn.content}</p>
              {turn.role === 'assistant' && /\p{Script=Han}/u.test(turn.content) ? (
                <button
                  type="button"
                  onClick={() => {
                    const han = turn.content.match(/[\p{Script=Han}，。！？]+/gu)?.join('，') ?? '';
                    if (han) speakChinese(han, { rate: 0.8 });
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-[var(--primary)]"
                >
                  <Icon name="listening" size={16} /> Nghe phần chữ Hán
                </button>
              ) : null}
            </li>
          ))}
          {ask.isPending ? (
            <li className="max-w-[92%] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[15px] text-[var(--text-muted)]">
              Gia sư đang soạn câu trả lời…
            </li>
          ) : null}
        </ul>
      )}

      {error ? (
        <p className="rounded-[var(--r-md)] bg-[var(--danger-soft)] p-3 text-[14px] text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Hỏi về một chữ, một cấu trúc, hay nhờ đặt câu ví dụ…"
          className="h-12 flex-1 rounded-[var(--r-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-[15px] outline-none focus:border-[var(--primary)]"
        />
        <button
          type="submit"
          disabled={ask.isPending || draft.trim().length === 0}
          className="h-12 rounded-[var(--r-md)] bg-[var(--primary)] px-5 text-[15px] font-semibold text-[var(--text-inverse)] disabled:opacity-50"
        >
          Hỏi
        </button>
      </form>
    </div>
  );
}
