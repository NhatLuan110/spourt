'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { countWords, type ExamActivity, type ExamResult } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LessonMarkdown } from '@/components/domain/lesson-markdown';
import { ExamAudio } from '@/components/domain/exam-audio';
import { useRecorder } from '@/lib/use-recorder';
import { examKeys, formatExamTime } from '@/lib/exam-prep';

export function ExamActivityRunner(props: { exam: string; level: string; activity: ExamActivity }) {
  const [attempt, setAttempt] = useState(0);
  return <ExamActivitySession key={attempt} {...props} onRetry={() => setAttempt(n => n + 1)} />;
}

function ExamActivitySession({ exam, level, activity, onRetry }: { exam: string; level: string; activity: ExamActivity; onRetry: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const storageKey = `sprout:exam-draft:${user?.id}:${exam}:${level}:${activity.id}`;
  const [ready, setReady] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [content, setContent] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const recorder = useRecorder(activity.timeLimitSec * 1000);
  const stopRecording = useRef(recorder.stop);
  stopRecording.current = recorder.stop;
  const preparationSec = activity.skill === 'speaking' ? activity.preparationSec ?? 0 : 0;
  const totalElapsed = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  const preparing = startedAt !== null && totalElapsed < preparationSec;
  const elapsed = Math.max(0, totalElapsed - preparationSec);
  const timeLeft = preparing ? preparationSec - totalElapsed : activity.timeLimitSec - elapsed;
  const objective = activity.skill === 'reading' || activity.skill === 'listening';
  const words = countWords(content);
  const allAnswered = (activity.questions ?? []).every(q => (answers[q.id] ?? '').trim());

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved && typeof saved === 'object') {
        const draft = saved as Record<string, unknown>;
        if (typeof draft.content === 'string') setContent(draft.content.slice(0, 12000));
        if (draft.answers && typeof draft.answers === 'object' && !Array.isArray(draft.answers)) setAnswers(Object.fromEntries(Object.entries(draft.answers).filter(([id, value]) => activity.questions?.some(q => q.id === id) && typeof value === 'string')));
        if (typeof draft.startedAt === 'number' && Number.isFinite(draft.startedAt) && draft.startedAt <= Date.now()) setStartedAt(draft.startedAt);
      }
    } catch { setStorageError(true); }
    setNow(Date.now()); setReady(true);
  }, [storageKey, activity.questions]);
  useEffect(() => {
    if (!ready || result) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ answers, content, startedAt })); } catch { setStorageError(true); }
  }, [ready, answers, content, startedAt, storageKey, result]);
  useEffect(() => {
    if (startedAt === null || result) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [startedAt, result]);
  useEffect(() => { if (timeLeft <= 0 && recorder.state === 'recording') stopRecording.current(); }, [timeLeft, recorder.state]);
  useEffect(() => () => { if (recorder.recording?.objectUrl) URL.revokeObjectURL(recorder.recording.objectUrl); }, [recorder.recording?.objectUrl]);

  const submit = useMutation({
    mutationFn: () => {
      const seconds = Math.min(86400, Math.max(0, Math.floor((Date.now() - (startedAt ?? Date.now())) / 1000) - preparationSec));
      return api.post<ExamResult>(`/exam-prep/${exam}/${level}/activities/${activity.id}/submit`, {
        elapsedSec: seconds,
        ...(objective ? { answers: (activity.questions ?? []).map(q => ({ questionId: q.id, value: answers[q.id] ?? '' })) } : { content: content.trim() || `[Bản ghi âm luyện nói trên thiết bị: ${Math.round((recorder.recording?.durationMs ?? 0) / 1000)} giây]` }),
      });
    },
    onSuccess: data => {
      setResult(data);
      try { localStorage.removeItem(storageKey); } catch { /* The saved draft remains usable if storage is blocked. */ }
      void queryClient.invalidateQueries({ queryKey: examKeys.history });
    },
  });

  if (!ready) return <p aria-busy="true">Đang mở bài luyện…</p>;
  const returnHref = `/exam-prep/${exam}/${level}?skill=${activity.skill}`;
  return <div className="flex flex-col gap-5">
    <Card><CardBody className="flex flex-col gap-3 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><Badge tone="neutral">{activity.format}</Badge><span className="text-sm">{formatExamTime(activity.timeLimitSec)} làm bài{preparationSec ? ` + ${preparationSec}s chuẩn bị` : ''}</span></div>
      <p className="leading-relaxed">{activity.instructionsVi}</p>
      {activity.minWords ? <p className="text-sm text-[var(--text-muted)]">Mục tiêu độ dài bài luyện: {activity.minWords}–{activity.maxWords} từ. Làm theo giới hạn riêng của từng phần trong đề.</p> : null}
      {!objective ? <p className="text-sm text-[var(--text-muted)]">Nộp bài để xem bài mẫu và tự đối chiếu theo tiêu chí. Phần này không chấm điểm thi tự động.</p> : null}
      {startedAt === null && !result ? <Button disabled={!ready} onClick={() => { const current = Date.now(); setNow(current); setStartedAt(current); }}>Bắt đầu tính giờ{preparationSec ? ' chuẩn bị' : ' làm bài'}</Button> : null}
    </CardBody></Card>

    {startedAt !== null && !result ? <>
      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-solid)] p-3 shadow-[var(--shadow-sm)]">
        <span className="font-medium">{preparing ? 'Chuẩn bị' : timeLeft <= 0 ? 'Đã hết thời gian mục tiêu' : 'Thời gian còn lại'}</span><span className="font-mono text-xl tabular-nums" role="timer" aria-label={preparing ? 'Thời gian chuẩn bị còn lại' : 'Thời gian làm bài còn lại'}>{formatExamTime(timeLeft)}</span>
      </div>
      {timeLeft <= 0 ? <p role="status" className="text-sm text-[var(--warning)]">Bạn có thể làm tiếp để ôn. Lượt này sẽ được ghi nhận là vượt thời gian mục tiêu.</p> : null}
      <Card><CardBody className="py-5"><LessonMarkdown source={activity.promptEn} /></CardBody></Card>
      {activity.passage ? <Card><CardBody className="py-5"><LessonMarkdown source={activity.passage} /></CardBody></Card> : null}
      {activity.transcript ? <ExamAudio transcript={activity.transcript} accent={activity.accent} rate={1 + Math.max(0, Math.min(3, Number(level) - 1)) * 0.05} /> : null}
      {objective ? <div className="flex flex-col gap-4">{activity.questions?.map((question, index) => <Card key={question.id}><CardBody className="py-5">
        <fieldset disabled={submit.isPending}><legend className="mb-4 font-medium">{index + 1}. {question.prompt}</legend>
          {question.kind === 'mcq' ? <div className="grid gap-2">{question.options?.map(option => <label key={option.id} className="flex cursor-pointer items-start gap-3 rounded-[var(--r-md)] border border-[var(--border)] p-3 has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[var(--primary-soft)]"><input type="radio" name={question.id} value={option.id} checked={answers[question.id] === option.id} onChange={() => setAnswers(old => ({ ...old, [question.id]: option.id }))} className="mt-1 accent-[var(--primary)]" /><span>{option.text}</span></label>)}</div> : <input type="text" aria-label={`Trả lời câu ${index + 1}`} maxLength={500} value={answers[question.id] ?? ''} onChange={e => setAnswers(old => ({ ...old, [question.id]: e.target.value }))} className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3" autoComplete="off" />}
        </fieldset>
      </CardBody></Card>)}</div> : <Card><CardBody className="flex flex-col gap-4 py-5">
        {activity.skill === 'speaking' ? <>
          <h2 className="text-xl">Ghi âm câu trả lời</h2>
          <p className="text-sm text-[var(--text-muted)]">Bản ghi ở trên thiết bị. Nghe lại hoặc tải xuống trước khi rời trang; micro chỉ mở khi bạn bấm ghi âm.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={preparing || recorder.state === 'requesting' || submit.isPending || (timeLeft <= 0 && recorder.state !== 'recording')} variant={recorder.state === 'recording' ? 'danger' : 'primary'} onClick={() => { if (recorder.state === 'recording') recorder.stop(); else void recorder.start(); }}>{recorder.state === 'recording' ? 'Dừng ghi âm' : recorder.state === 'requesting' ? 'Đang xin quyền micro…' : recorder.recording ? 'Ghi âm lại' : 'Bắt đầu ghi âm'}</Button>
            <span className="font-mono text-sm">{formatExamTime(recorder.elapsedMs / 1000)}</span>
          </div>
          {recorder.state === 'denied' || recorder.state === 'unsupported' ? <p role="alert" className="text-sm text-[var(--warning)]">{recorder.state === 'denied' ? 'Chưa có quyền micro. Cho phép micro trong trình duyệt để ghi âm.' : 'Trình duyệt chưa hỗ trợ ghi âm.'} Bạn vẫn có thể luyện nói và nhập phần trả lời để đối chiếu.</p> : null}
          {recorder.recording ? <div className="space-y-2">
            {/* A spontaneous learner recording has no transcript until the learner supplies one. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={recorder.recording.objectUrl} className="w-full" aria-label="Nghe lại câu trả lời của bạn" />
            <a download={`${activity.id}.${recorder.recording.mimeType.split('/')[1]}`} href={recorder.recording.objectUrl} className="text-sm text-[var(--primary)] underline">Tải bản ghi âm</a>
          </div> : null}
        </> : null}
        <label htmlFor="exam-response" className="font-medium">{activity.skill === 'speaking' ? 'Phần trả lời hoặc ghi chú của bạn' : 'Bài viết của bạn'}</label>
        <textarea id="exam-response" rows={activity.skill === 'speaking' ? 5 : 14} maxLength={12000} value={content} disabled={submit.isPending} onChange={e => setContent(e.target.value)} spellCheck={false} className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4 leading-relaxed" />
        <p className="text-sm text-[var(--text-muted)]">{words} từ{activity.minWords && words < activity.minWords ? ` · Còn thiếu ${activity.minWords - words} từ so với mục tiêu` : activity.maxWords && words > activity.maxWords ? ` · Vượt ${words - activity.maxWords} từ` : ''}</p>
      </CardBody></Card>}
      {storageError ? <p className="text-sm text-[var(--warning)]">Trình duyệt không lưu được bản nháp. Giữ trang mở đến khi nộp bài.</p> : null}
      {submit.isError ? <p role="alert" className="text-[var(--danger)]">{submit.error.message} Câu trả lời vẫn được giữ để bạn nộp lại.</p> : null}
      <Button size="lg" loading={submit.isPending} disabled={preparing || recorder.state === 'recording' || recorder.state === 'requesting' || (objective ? !allAnswered : !content.trim() && !recorder.recording)} onClick={() => submit.mutate()}>{objective ? 'Nộp bài và xem đáp án' : 'Nộp bài và đối chiếu bài mẫu'}</Button>
      {objective && !allAnswered ? <p className="text-center text-sm text-[var(--text-muted)]">Trả lời đủ {activity.questions?.length} câu để nộp bài.</p> : null}
    </> : null}

    {result ? <>
      <Card><CardBody className="space-y-3 py-5"><h2 className="text-[24px]" role="status">{result.correctCount !== null ? `Đúng ${result.correctCount}/${result.total} câu` : 'Đã lưu lượt luyện · tự đối chiếu'}</h2><Badge tone={result.withinTime ? 'success' : 'warning'}>{result.withinTime ? 'Hoàn thành trong thời gian mục tiêu' : 'Vượt thời gian mục tiêu'}</Badge><p className="text-sm text-[var(--text-muted)]">Kết quả luyện tập này không quy đổi thành điểm {exam.toUpperCase()}.</p></CardBody></Card>
      {result.feedback.map(feedback => {
        const q = activity.questions?.find(item => item.id === feedback.questionId);
        const given = answers[feedback.questionId] ?? '';
        return <Card key={feedback.questionId}><CardBody className="space-y-3 py-5"><Badge tone={feedback.correct ? 'success' : 'warning'}>{feedback.correct ? 'Đúng' : 'Cần ôn lại'}</Badge><p className="font-medium">{q?.prompt}</p><p className="text-sm">Bạn chọn: {q?.options?.find(o => o.id === given)?.text ?? given}</p><p className="text-sm">Đáp án: {q?.options?.find(o => o.id === feedback.answer)?.text ?? feedback.answer}</p><p className="text-[15px] leading-relaxed text-[var(--text-muted)]">{feedback.explanationVi}</p></CardBody></Card>;
      })}
      {activity.transcript ? <Card><CardBody className="space-y-4 py-5"><h2 className="text-xl">Bản chép lời</h2>{activity.transcript.map((turn, i) => <p key={i} className="leading-relaxed"><span className="font-medium">{turn.speaker}: </span>{turn.text}</p>)}</CardBody></Card> : null}
      {!objective ? <Card><CardBody className="space-y-4 py-5"><h2 className="text-xl">Bài làm của bạn</h2><p className="whitespace-pre-wrap leading-relaxed">{content || 'Bạn đã luyện bằng bản ghi âm.'}</p>{recorder.recording ? <>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={recorder.recording.objectUrl} className="w-full" aria-label="Bản ghi âm bài làm" /><a download={`${activity.id}.${recorder.recording.mimeType.split('/')[1]}`} href={recorder.recording.objectUrl} className="inline-block text-sm underline">Tải bản ghi âm trước khi rời trang</a>
      </> : null}</CardBody></Card> : null}
      {result.sampleAnswer ? <Card><CardBody className="space-y-3 py-5"><h2 className="text-xl">Bài mẫu để đối chiếu</h2><LessonMarkdown source={result.sampleAnswer} /></CardBody></Card> : null}
      {result.rubricVi.length ? <Card><CardBody className="space-y-4 py-5"><h2 className="text-xl">Tự kiểm tra bài làm</h2>{result.rubricVi.map((criterion, i) => <label key={i} className="flex items-start gap-3 text-[15px] leading-relaxed"><input type="checkbox" checked={checked.includes(i)} onChange={e => setChecked(old => e.target.checked ? [...old, i] : old.filter(n => n !== i))} className="mt-1 accent-[var(--primary)]" /><span>{criterion}</span></label>)}<p className="text-sm text-[var(--text-muted)]">Bạn đã tự xác nhận {checked.length}/{result.rubricVi.length} tiêu chí. Đây là tự đánh giá, không phải điểm chấm tự động.</p></CardBody></Card> : null}
      <div className="flex flex-wrap gap-3"><Button onClick={onRetry}>Luyện lại bài này</Button><Link href={returnHref} className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">Chọn bài khác →</Link></div>
    </> : null}
  </div>;
}
