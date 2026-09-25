'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ExamWord } from '@sprout/shared';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { speak } from '@/lib/speech';

export function ExamVocabulary({ words }: { words: ExamWord[] }) {
  const [mode, setMode] = useState<'learn' | 'quiz'>('learn');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [soundError, setSoundError] = useState(false);
  const word = words[index];
  // Different distractor positions for each word, stable while answering.
  const choices = useMemo(() => {
    if (!word) return [];
    const others = words.filter(w => w.id !== word.id && w.meaningVi !== word.meaningVi);
    const selected = others.filter((_, i) => i % 3 === index % 3).slice(0, 3);
    const all = [...selected];
    all.splice(index % (all.length + 1), 0, word);
    return all;
  }, [words, word, index]);
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  if (!word) return <p>Chưa có từ vựng ở mức này.</p>;
  const answer = answers[word.id];
  const completed = Object.keys(answers).length === words.length;
  const correct = words.filter(w => answers[w.id] === w.id).length;
  function move(delta: number) { setIndex(i => Math.max(0, Math.min(words.length - 1, i + delta))); setRevealed(false); }
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={mode === 'learn' ? 'primary' : 'secondary'} onClick={() => { setMode('learn'); setRevealed(false); }}>Học bằng thẻ</Button>
      <Button variant={mode === 'quiz' ? 'primary' : 'secondary'} onClick={() => { setMode('quiz'); setIndex(0); setRevealed(false); }}>Kiểm tra nghĩa</Button>
      <span className="ml-auto text-sm text-[var(--text-muted)]">Từ {index + 1}/{words.length}</span>
    </div>
    {completed && mode === 'quiz' ? <Card><CardBody className="flex flex-wrap items-center justify-between gap-3 py-4"><p role="status">Đúng {correct}/{words.length} từ. Lật lại các thẻ để ôn từ chưa nhớ.</p><Button variant="secondary" onClick={() => { setAnswers({}); setIndex(0); }}>Kiểm tra lại</Button></CardBody></Card> : null}
    <Card><CardBody className="flex flex-col gap-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-[28px]">{word.term}</h3><p className="text-[var(--text-muted)]">{word.ipa}</p></div><Button variant="secondary" onClick={() => setSoundError(!speak(word.term))}>Nghe phát âm</Button></div>
      {soundError ? <p role="alert" className="text-sm text-[var(--warning)]">Trình duyệt chưa hỗ trợ đọc tiếng Anh.</p> : null}
      {mode === 'quiz' ? <fieldset className="grid gap-2"><legend className="mb-3 text-sm">Chọn nghĩa phù hợp của từ</legend>{choices.map(choice => <Button key={choice.id} variant={answer === choice.id ? 'primary' : 'secondary'} className="h-auto min-h-11 justify-start whitespace-normal py-3 text-left" disabled={answer !== undefined} onClick={() => setAnswers(old => ({ ...old, [word.id]: choice.id }))}>{choice.meaningVi}</Button>)}</fieldset> : <Button variant="secondary" onClick={() => setRevealed(v => !v)}>{revealed ? 'Ẩn nghĩa và ví dụ' : 'Lật thẻ · xem nghĩa và ví dụ'}</Button>}
      {revealed || answer !== undefined && mode === 'quiz' ? <div className="flex flex-col gap-3 rounded-[var(--r-md)] bg-[var(--surface-alt)] p-4">
        {mode === 'quiz' && answer !== undefined ? <Badge tone={answer === word.id ? 'success' : 'warning'} className="w-fit">{answer === word.id ? 'Chính xác' : 'Cần ôn lại'}</Badge> : null}
        <p className="text-lg font-medium">{word.meaningVi}</p><p>{word.definitionEn}</p>
        <p className="leading-relaxed">{word.example}</p><p className="text-sm text-[var(--text-muted)]">{word.exampleVi}</p>
        <p className="text-sm"><span className="font-medium">Cụm từ thường gặp: </span>{word.collocations.join(' · ')}</p>
      </div> : null}
      <div className="flex justify-between gap-3"><Button variant="ghost" disabled={index === 0} onClick={() => move(-1)}>← Từ trước</Button><Button disabled={index === words.length - 1} onClick={() => move(1)}>Từ tiếp →</Button></div>
    </CardBody></Card>
  </div>;
}
