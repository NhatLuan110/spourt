'use client';

import { use } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { formatIntervalVi } from '@sprout/shared';
import type { CefrLevel } from '@sprout/shared';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, CefrTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WordAudio } from '@/components/domain/word-audio';
import { ExampleSentence } from '@/components/domain/example-sentence';
import { queryKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';
import { api } from '@/lib/api-client';
import { STATE_LABEL_VI, STATE_TONE } from '@/lib/srs-labels';
import type { LearnCommitResponse } from '@/lib/api-types';

export default function WordPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const t = useTranslations();
  const queryClient = useQueryClient();

  const word = useQuery({ queryKey: queryKeys.word(slug), queryFn: () => fetchers.word(slug) });

  const addToCollection = useMutation({
    mutationFn: (wordId: string) =>
      api.post<LearnCommitResponse>('/learn/commit', {
        wordIds: [wordId],
        sourceType: 'manual',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.word(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  if (word.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-[220px] w-full rounded-[var(--r-lg)]" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (word.isError || !word.data) {
    return (
      <EmptyState
        title={t('common.errorTitle')}
        body={t('common.errorBody')}
        action={<Button onClick={() => void word.refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  const entry = word.data;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-[13px] text-[var(--text-muted)]">
        <Link href="/vocabulary" className="hover:text-[var(--text)]">
          {t('vocabulary.title')}
        </Link>
        {entry.topics[0] ? (
          <>
            <span aria-hidden="true"> / </span>
            <Link href={`/vocabulary/${entry.topics[0].slug}`} className="hover:text-[var(--text)]">
              {entry.topics[0].nameVi}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true"> / </span>
        <span>{entry.lemma}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-[34px]">
            {entry.lemma}
            <CefrTag level={entry.cefr as CefrLevel} withLabel />
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {entry.ipaUs ? (
              <span className="ipa text-[16px]">
                US {entry.ipaUs}
              </span>
            ) : null}
            {entry.ipaUk && entry.ipaUk !== entry.ipaUs ? (
              <span className="ipa text-[16px]">UK {entry.ipaUk}</span>
            ) : null}
            <WordAudio
              both
              text={entry.lemma}
              urlUs={entry.audioUsUrl}
              urlUk={entry.audioUkUrl}
            />
          </div>
          <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
            {entry.syllables ? `${entry.syllables} · ` : ''}
            {entry.stressPattern ? `${t('word.stress')} ${entry.stressPattern} · ` : ''}
            {entry.frequencyRank ? t('word.frequency', { rank: entry.frequencyRank }) : ''}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {entry.userWord ? (
            <>
              <Badge tone={STATE_TONE[entry.userWord.state] ?? 'neutral'}>
                {STATE_LABEL_VI[entry.userWord.state] ?? entry.userWord.state}
              </Badge>
              <p className="text-[13px] text-[var(--text-muted)]">
                {t('word.nextReview', {
                  when: formatIntervalVi(entry.userWord.intervalDays),
                })}
              </p>
              {entry.userWord.totalReviews > 0 ? (
                <p className="text-[13px] text-[var(--text-subtle)]">
                  {t('word.accuracy', {
                    percent: Math.round(
                      (entry.userWord.correctReviews / entry.userWord.totalReviews) * 100,
                    ),
                  })}
                  {entry.userWord.lapses > 0
                    ? ` · ${t('word.lapses', { count: entry.userWord.lapses })}`
                    : ''}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[13px] text-[var(--text-muted)]">{t('word.notLearning')}</p>
              <Button
                loading={addToCollection.isPending}
                onClick={() => addToCollection.mutate(entry.id)}
              >
                {t('word.addToCollection')}
              </Button>
              {addToCollection.isError ? (
                <p role="alert" className="text-[13px] text-[var(--danger)]">
                  {addToCollection.error instanceof Error
                    ? addToCollection.error.message
                    : t('common.errorBody')}
                </p>
              ) : null}
            </>
          )}
        </div>
      </header>

      <section aria-labelledby="senses-heading" className="flex flex-col gap-4">
        <h2 id="senses-heading" className="text-[18px]">
          {t('word.senses')}
        </h2>
        {entry.senses.map((sense, index) => (
          <Card key={sense.id}>
            <CardBody className="flex flex-col gap-3 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-[var(--text-subtle)]">{index + 1}.</span>
                <Badge tone="primary">{sense.posLabelVi}</Badge>
                {sense.register ? <Badge>{sense.register}</Badge> : null}
              </div>
              <p className="text-[17px]">{sense.definitionVi}</p>
              <p className="text-[14px] text-[var(--text-muted)]">{sense.definitionEn}</p>

              {sense.examples.length > 0 ? (
                <div className="mt-1 flex flex-col gap-2 border-l-2 border-[var(--border)] pl-3">
                  {sense.examples.map((example) => (
                    <ExampleSentence key={example.textEn} example={example} />
                  ))}
                </div>
              ) : null}

              {sense.synonyms.length > 0 || sense.antonyms.length > 0 ? (
                <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                  {sense.synonyms.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <dt className="text-[var(--text-subtle)]">{t('word.synonyms')}</dt>
                      <dd className="flex flex-wrap gap-1">
                        {sense.synonyms.map((item) => (
                          <Badge key={item} tone="success">
                            {item}
                          </Badge>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                  {sense.antonyms.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <dt className="text-[var(--text-subtle)]">{t('word.antonyms')}</dt>
                      <dd className="flex flex-wrap gap-1">
                        {sense.antonyms.map((item) => (
                          <Badge key={item} tone="danger">
                            {item}
                          </Badge>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </section>

      {entry.family ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('word.family')} · {entry.family.glossVi}
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-2">
              {entry.family.members.map((member) => (
                <li key={`${member.slug}-${member.pos}`} className="flex flex-wrap items-center gap-2">
                  <Link href={`/word/${member.slug}`} className="text-[15px] hover:underline">
                    {member.lemma}
                  </Link>
                  <Badge tone="primary">{member.posLabelVi}</Badge>
                  {member.suffix ? (
                    <span className="text-[13px] text-[var(--text-subtle)]">{member.suffix}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <Link
              href={`/word-class?family=${entry.family.rootSlug}`}
              className="mt-3 inline-block text-[14px] text-[var(--primary)] hover:underline"
            >
              {t('wordClass.practice')} →
            </Link>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
