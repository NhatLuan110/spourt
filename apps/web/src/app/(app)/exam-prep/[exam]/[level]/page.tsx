'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExamVocabulary } from '@/components/domain/exam-vocabulary';
import { examFetchers, examKeys, EXAM_SKILLS, EXAM_SKILL_LABELS, formatExamTime, type ExamSkillTab } from '@/lib/exam-prep';

export default function ExamLevelPage() {
  const params = useParams<{ exam: string; level: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get('skill');
  const skill: ExamSkillTab = EXAM_SKILLS.find(s => s === requested) ?? 'reading';
  const catalog = useQuery({ queryKey: examKeys.catalog, queryFn: examFetchers.catalog });
  const pack = useQuery({ queryKey: examKeys.pack(params.exam, params.level), queryFn: () => examFetchers.pack(params.exam, params.level) });
  const history = useQuery({ queryKey: examKeys.history, queryFn: examFetchers.history });
  const exam = catalog.data?.find(e => e.id === params.exam);
  const level = exam?.levels.find(l => l.id === params.level);
  const sw = skill === 'writing' || skill === 'speaking';
  if (pack.isPending || catalog.isPending) return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
  if (pack.isError || catalog.isError || !exam || !level || !pack.data) return <Card><CardBody className="space-y-4 py-6"><p role="alert">{pack.error?.message ?? catalog.error?.message ?? 'Không tìm thấy kỳ thi hoặc mức mục tiêu này.'}</p><Button onClick={() => { void pack.refetch(); void catalog.refetch(); }}>Tải lại</Button><Link href="/exam-prep" className="block underline">← Chọn kỳ thi</Link></CardBody></Card>;
  const data = pack.data;
  return <div className="flex flex-col gap-6">
    <header className="space-y-2"><Link href="/exam-prep" className="text-sm text-[var(--text-muted)]">← Chọn kỳ thi</Link><h1 className="text-[28px]">{exam.name} · {EXAM_SKILL_LABELS[skill]}</h1><p className="text-sm text-[var(--text-muted)]">{exam.variant}</p></header>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Kỹ năng ôn thi">{EXAM_SKILLS.map(s => <Button key={s} variant={s === skill ? 'primary' : 'secondary'} aria-pressed={s === skill} onClick={() => router.replace(`/exam-prep/${params.exam}/${params.level}?skill=${s}`, { scroll: false })}>{EXAM_SKILL_LABELS[s]} · {level.counts[s]}</Button>)}</div>
    <Card><CardBody className="flex flex-col gap-3 py-5">
      <label htmlFor="exam-target" className="text-sm font-medium">Mức mục tiêu {params.exam === 'toeic' ? sw ? 'Nói / Viết · mỗi kỹ năng' : 'Nghe + Đọc' : ''}</label>
      <select id="exam-target" value={params.level} onChange={e => router.push(`/exam-prep/${params.exam}/${e.target.value}?skill=${skill}`)} className="w-full max-w-sm rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base">{exam.levels.map(l => <option key={l.id} value={l.id}>{sw && l.speakingWritingTargetLabel ? l.speakingWritingTargetLabel : l.targetLabel}</option>)}</select>
      <div className="flex flex-wrap items-center gap-2"><Badge tone="warning">{level.stretchLabel}</Badge><span className="text-sm text-[var(--text-muted)]">Thời gian luyện được rút ngắn</span></div>
      <p className="text-[15px] leading-relaxed">{level.descriptionVi}</p>
      <p className="text-sm text-[var(--text-subtle)]">{exam.scoreNoteVi}</p>
    </CardBody></Card>
    {skill === 'vocabulary' ? <ExamVocabulary key={`${params.exam}-${params.level}`} words={data.vocabulary} /> : <div className="grid gap-4 md:grid-cols-2">{data.activities.filter(a => a.skill === skill).map(activity => {
      const attempts = history.data?.filter(h => h.examId === params.exam && h.levelId === params.level && h.activityId === activity.id) ?? [];
      const best = attempts.filter(a => a.correctCount !== null).reduce((score, a) => Math.max(score, a.correctCount ?? 0), 0);
      return <Card key={activity.id}><CardBody className="flex h-full flex-col gap-3 py-5"><Badge tone="neutral" className="w-fit">{activity.format}</Badge><h2 className="text-[20px]">{activity.title}</h2><p className="text-sm leading-relaxed text-[var(--text-muted)]">{activity.instructionsVi}</p><p className="text-sm">{formatExamTime(activity.timeLimitSec)} làm bài{activity.preparationSec ? ` · ${activity.preparationSec}s chuẩn bị` : ''}{activity.questions ? ` · ${activity.questions.length} câu` : ''}</p>{attempts.length > 0 ? <p className="text-sm text-[var(--success)]">Đã luyện {attempts.length} lần{activity.questions ? ` · Tốt nhất ${best}/${activity.questions.length}` : ' · Có bản tự đánh giá'}</p> : null}<Link href={`/exam-prep/${params.exam}/${params.level}/${activity.id}`} className="mt-auto rounded-[var(--r-md)] bg-[var(--primary)] px-4 py-3 text-center font-medium text-[var(--text-inverse)]">{attempts.length ? 'Luyện lại' : 'Bắt đầu luyện'} →</Link></CardBody></Card>;
    })}</div>}
    {history.isError ? <p className="text-sm text-[var(--warning)]">Chưa tải được lịch sử. <button className="underline" onClick={() => void history.refetch()}>Thử lại</button></p> : null}
  </div>;
}
