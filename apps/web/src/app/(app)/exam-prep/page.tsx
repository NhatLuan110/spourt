'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { examFetchers, examKeys } from '@/lib/exam-prep';

export default function ExamPrepPage() {
  const catalog = useQuery({ queryKey: examKeys.catalog, queryFn: examFetchers.catalog });
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Badge tone="warning" className="w-fit">Luyện vượt mục tiêu</Badge>
        <h1 className="text-[30px]">Ôn thi tiếng Anh</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Chọn kỳ thi và mức mục tiêu để luyện từ vựng, đọc, nghe, viết, nói. Bài tập tăng thử thách bằng ngôn ngữ phức tạp hơn, câu hỏi suy luận và thời gian ngắn hơn.
        </p>
      </header>
      {catalog.isPending ? <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-72" />)}</div> : null}
      {catalog.isError ? <Card><CardBody className="space-y-3 py-6"><p role="alert">{catalog.error.message}</p><Button onClick={() => void catalog.refetch()}>Tải lại</Button></CardBody></Card> : null}
      <div className="grid gap-5 xl:grid-cols-3">
        {catalog.data?.map(exam => {
          const counts = exam.levels.reduce((total, level) => ({ words: total.words + level.counts.vocabulary, activities: total.activities + level.counts.reading + level.counts.listening + level.counts.writing + level.counts.speaking }), { words: 0, activities: 0 });
          return <Card key={exam.id} className="h-full"><CardBody className="flex h-full flex-col gap-4 py-6">
            <div><h2 className="text-[25px]">{exam.name}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{exam.variant}</p></div>
            <p className="text-[15px] leading-relaxed">{exam.descriptionVi}</p>
            <div className="flex flex-wrap gap-2"><Badge tone="info">{counts.words} từ chuyên thi</Badge><Badge tone="neutral">{counts.activities} bài luyện</Badge></div>
            <p className="text-sm text-[var(--text-muted)]">{exam.scoreNoteVi}</p>
            <div className="mt-auto grid grid-cols-2 gap-2" aria-label={`Mục tiêu ${exam.name}`}>
              {exam.levels.map(level => <Link key={level.id} href={`/exam-prep/${exam.id}/${level.id}`} className="rounded-[var(--r-md)] border border-[var(--border)] p-3 text-center text-sm hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">{level.targetLabel}</Link>)}
            </div>
            <a href={exam.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-[var(--primary)] underline">Cấu trúc kỳ thi từ đơn vị tổ chức ↗</a>
          </CardBody></Card>;
        })}
      </div>
      <p className="text-sm leading-relaxed text-[var(--text-subtle)]">Bài luyện do Sprout biên soạn, không phải đề thi chính thức. Mức thử thách là thiết kế luyện tập; kết quả trong app không quy đổi thành điểm thi hay bảo đảm đạt điểm mục tiêu.</p>
    </div>
  );
}
