'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { WordAudio } from '@/components/domain/word-audio';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import type { CefrLevel } from '@sprout/shared';
import { STATE_LABEL_VI, STATE_TONE } from '@/lib/srs-labels';

const PAGE_SIZE = 24;

export default function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: slug } = use(params);
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [subtopic, setSubtopic] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<'frequency' | 'alphabet' | 'cefr' | 'learned'>('frequency');
  const learningTopic = subtopic ?? slug;

  const topic = useQuery({ queryKey: queryKeys.topic(slug), queryFn: () => fetchers.topic(slug) });

  const listParams = { page, limit: PAGE_SIZE, search: search || undefined, subtopic, sort };
  const words = useQuery({
    queryKey: queryKeys.topicWords(slug, listParams),
    queryFn: () => fetchers.topicWords(slug, listParams),
  });

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-[13px] text-[var(--text-muted)]">
        <Link href="/vocabulary" className="hover:text-[var(--text)]">
          {t('vocabulary.title')}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{topic.data?.nameVi ?? slug}</span>
      </nav>

      {topic.isPending ? (
        <Skeleton className="h-[120px] w-full rounded-[var(--r-lg)]" />
      ) : topic.isError || !topic.data ? (
        <EmptyState
          title={t('common.errorTitle')}
          body={t('common.errorBody')}
          action={<Button onClick={() => void topic.refetch()}>{t('common.retry')}</Button>}
        />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="text-[40px]">
                {topic.data.emoji}
              </span>
              <div>
                <h1 className="text-[30px]">{topic.data.nameVi}</h1>
                <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
                  {topic.data.description}
                </p>
                <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
                  {t('vocabulary.learnedOf', {
                    learned: topic.data.learnedCount,
                    total: topic.data.wordCount,
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/learn?topic=${learningTopic}`}>
                <Button>{t('vocabulary.learnNew')}</Button>
              </Link>
              <Link href={`/practice?topic=${learningTopic}`}>
                <Button variant="secondary">{t('vocabulary.practice')}</Button>
              </Link>
              <Link href={`/flashcards?source=topic&ref=${learningTopic}`}>
                <Button variant="secondary">{t('flashcards.open')}</Button>
              </Link>
              {topic.data.dueCount > 0 ? (
                <Link href={`/review?topic=${slug}`}>
                  <Button variant="accent">
                    {t('vocabulary.review')} ({topic.data.dueCount})
                  </Button>
                </Link>
              ) : null}
            </div>
          </header>

          <section aria-labelledby="subtopics-heading">
            <h2 id="subtopics-heading" className="mb-2 text-[16px]">
              {t('vocabulary.subtopics')}
            </h2>
            <ul className="flex flex-wrap gap-2">
              <li>
                <FilterChip
                  active={subtopic === undefined}
                  onClick={() => {
                    setSubtopic(undefined);
                    setPage(1);
                  }}
                >
                  {t('vocabulary.filterAll')}
                </FilterChip>
              </li>
              {topic.data.subtopics.map((sub) => (
                <li key={sub.slug}>
                  <FilterChip
                    active={subtopic === sub.slug}
                    onClick={() => {
                      setSubtopic(sub.slug);
                      setPage(1);
                    }}
                  >
                    {sub.nameVi}
                    <span className="ml-1 text-[var(--text-subtle)]">{sub.wordCount}</span>
                  </FilterChip>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section aria-labelledby="words-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <h2 id="words-heading" className="text-[16px]">
            {t('vocabulary.allWords')}
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="text-[13px] text-[var(--text-muted)]" htmlFor="sort">
              Sắp xếp
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as typeof sort);
                setPage(1);
              }}
              className="h-9 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-alt)] px-2 text-[14px]"
            >
              <option value="frequency">{t('vocabulary.sortFrequency')}</option>
              <option value="alphabet">{t('vocabulary.sortAlphabet')}</option>
              <option value="cefr">{t('vocabulary.sortCefr')}</option>
              <option value="learned">{t('vocabulary.sortLearned')}</option>
            </select>
            <div className="w-[220px]">
              <Input
                type="search"
                aria-label={t('vocabulary.search')}
                placeholder={t('vocabulary.search')}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {words.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
            {Array.from({ length: 6 }, (_unused, index) => (
              <Skeleton key={index} className="h-[92px] w-full rounded-[var(--r-md)]" />
            ))}
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : words.isError || !words.data ? (
          <EmptyState
            title={t('common.errorTitle')}
            body={t('common.errorBody')}
            action={<Button onClick={() => void words.refetch()}>{t('common.retry')}</Button>}
          />
        ) : words.data.data.length === 0 ? (
          <EmptyState title={t('vocabulary.noResults')} body={t('vocabulary.noResultsBody')} />
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {words.data.data.map((word) => (
                <li key={word.id}>
                  <Card className="h-full transition-colors hover:border-[var(--primary)]">
                    <CardBody className="flex flex-col gap-1.5 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/word/${word.slug}`}
                          className="text-[18px] font-medium hover:underline"
                        >
                          {word.lemma}
                        </Link>
                        <CefrTag level={word.cefr as CefrLevel} />
                        {word.learnState ? (
                          <Badge tone={STATE_TONE[word.learnState] ?? 'neutral'}>
                            {STATE_LABEL_VI[word.learnState] ?? word.learnState}
                          </Badge>
                        ) : null}
                        <WordAudio
                          className="ml-auto"
                          size="sm"
                          text={word.lemma}
                          urlUs={word.audioUsUrl}
                          urlUk={word.audioUkUrl}
                        />
                      </div>
                      {word.ipaUs ? <p className="ipa text-[13px]">{word.ipaUs}</p> : null}
                      <p className="text-[14px] text-[var(--text-muted)]">{word.definitionVi}</p>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>

            <Pagination
              page={words.data.meta.page}
              hasMore={words.data.meta.hasMore}
              total={words.data.meta.total}
              onChange={setPage}
              labels={{
                prev: t('vocabulary.prev'),
                next: t('vocabulary.next'),
                page: t('vocabulary.page', { page: words.data.meta.page }),
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded-[var(--r-full)] border px-3 py-1.5 text-[13px] transition-colors',
        active
          ? 'border-transparent bg-[var(--primary)] text-[var(--text-inverse)]'
          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Pagination({
  page,
  hasMore,
  total,
  onChange,
  labels,
}: {
  page: number;
  hasMore: boolean;
  total: number;
  onChange: (page: number) => void;
  labels: { prev: string; next: string; page: string };
}) {
  if (total === 0) return null;

  return (
    <nav className="flex items-center justify-center gap-3" aria-label="Phân trang">
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {labels.prev}
      </Button>
      <span className="text-[13px] text-[var(--text-muted)]">
        {labels.page} · {total} từ
      </span>
      <Button variant="secondary" size="sm" disabled={!hasMore} onClick={() => onChange(page + 1)}>
        {labels.next}
      </Button>
    </nav>
  );
}
