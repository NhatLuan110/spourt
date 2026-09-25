'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ExamActivityRunner } from '@/components/domain/exam-activity';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { examFetchers, examKeys, EXAM_SKILL_LABELS } from '@/lib/exam-prep';

export default function ExamActivityPage() {
  const params = useParams<{ exam: string; level: string; activity: string }>();
  const pack = useQuery({ queryKey: examKeys.pack(params.exam, params.level), queryFn: () => examFetchers.pack(params.exam, params.level) });
  if (pack.isPending) return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
  const activity = pack.data?.activities.find(a => a.id === params.activity);
  if (pack.isError || !activity) return <Card><CardBody className="space-y-4 py-6"><p role="alert">{pack.error?.message ?? 'Không tìm thấy bài luyện này.'}</p>{pack.isError ? <Button onClick={() => void pack.refetch()}>Tải lại</Button> : null}<Link href="/exam-prep" className="block underline">← Chọn kỳ thi</Link></CardBody></Card>;
  return <div className="flex flex-col gap-5"><header className="space-y-2"><Link href={`/exam-prep/${params.exam}/${params.level}?skill=${activity.skill}`} className="text-sm text-[var(--text-muted)]">← {params.exam.toUpperCase()} · {EXAM_SKILL_LABELS[activity.skill]}</Link><h1 className="text-[28px]">{activity.title}</h1></header><ExamActivityRunner key={`${params.exam}-${params.level}-${activity.id}`} exam={params.exam} level={params.level} activity={activity} /></div>;
}
