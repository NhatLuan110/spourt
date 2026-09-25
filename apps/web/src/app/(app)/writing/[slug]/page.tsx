'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { countWords } from '@sprout/shared';
import type { WritingSubmissionView } from '@sprout/shared';
import { api } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LessonMarkdown } from '@/components/domain/lesson-markdown';
import { aiKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function WritingPromptPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const queryClient = useQueryClient();

  const [content, setContent] = useState('');
  const [showSample, setShowSample] = useState(false);

  const prompt = useQuery({
    queryKey: aiKeys.writingPrompt(slug),
    queryFn: () => fetchers.writingPrompt(slug),
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post<WritingSubmissionView>('/writing/submissions', { promptSlug: slug, content }),
    onSuccess: async (submission) => {
      await queryClient.invalidateQueries({ queryKey: aiKeys.submissions });
      await queryClient.invalidateQueries({ queryKey: aiKeys.writingPrompt(slug) });
      router.push(`/writing/result/${submission.id}`);
    },
  });

  if (prompt.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (prompt.isError || !prompt.data) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-[15px] text-[var(--text-muted)]">{t('writing.loadFailed')}</p>
          <Link href="/writing" className="mt-3 inline-block text-[var(--primary)] underline">
            {t('writing.backToList')}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const data = prompt.data;
  const words = countWords(content);
  const tooShort = words < data.minWords;
  const tooLong = words > data.maxWords;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/writing" className="text-[14px] text-[var(--text-muted)]">
          ← {t('writing.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px]">{data.title}</h1>
          <CefrTag level={data.cefr} />
          <Badge tone="neutral">{t(`writing.kind.${data.kind}`)}</Badge>
        </div>
      </header>

      <Card>
        <CardBody className="flex flex-col gap-3 py-5">
          <h2 className="text-[18px]">{t('writing.task')}</h2>
          <p className="text-[15px] leading-relaxed">{data.instructionsVi}</p>
          <p className="text-[14px] italic text-[var(--text-muted)]">{data.instructionsEn}</p>
          <p className="text-[13px] text-[var(--text-subtle)]">
            {t('writing.meta', {
              min: data.minWords,
              max: data.maxWords,
              minutes: data.timeLimitMin ?? 0,
            })}
          </p>
        </CardBody>
      </Card>

      {data.outlineVi ? (
        <Card>
          <CardBody className="flex flex-col gap-2 py-5">
            <h2 className="text-[18px]">{t('writing.outline')}</h2>
            <LessonMarkdown source={data.outlineVi} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-3 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[18px]">{t('writing.yourAnswer')}</h2>
            <span
              className={cn(
                'text-[13px]',
                tooShort || tooLong ? 'text-[var(--warning)]' : 'text-[var(--text-subtle)]',
              )}
            >
              {t('writing.wordCount', { count: words })}
              {tooShort ? ` · ${t('writing.tooShort', { min: data.minWords })}` : ''}
              {tooLong ? ` · ${t('writing.tooLong', { max: data.maxWords })}` : ''}
            </span>
          </div>

          <textarea
            rows={14}
            spellCheck={false}
            aria-label={t('writing.yourAnswer')}
            placeholder={t('writing.placeholder')}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[16px] leading-relaxed outline-none focus:border-[var(--primary)]"
          />

          <Button
            size="lg"
            disabled={words < (data.kind === 'sentence' ? data.minWords : 10)}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? t('writing.grading') : t('writing.submit')}
          </Button>

          {submit.isError ? (
            <p className="text-[14px] text-[var(--danger)]">
              {submit.error instanceof Error ? submit.error.message : t('writing.submitFailed')}
            </p>
          ) : null}

          <p className="text-[13px] text-[var(--text-subtle)]">{t('writing.gradingNotice')}</p>
        </CardBody>
      </Card>

      {data.sampleAnswer ? (
        <Card>
          <CardBody className="flex flex-col gap-3 py-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[18px]">{t('writing.sample')}</h2>
              <Button variant="ghost" onClick={() => setShowSample((shown) => !shown)}>
                {showSample ? t('writing.hideSample') : t('writing.showSample')}
              </Button>
            </div>
            {showSample ? (
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
                {data.sampleAnswer}
              </pre>
            ) : (
              <p className="text-[14px] text-[var(--text-muted)]">{t('writing.sampleHidden')}</p>
            )}
          </CardBody>
        </Card>
      ) : (
        <p className="text-center text-[13px] text-[var(--text-subtle)]">
          {t('writing.sampleAfterAttempt')}
        </p>
      )}
    </div>
  );
}
