'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { vocabKeys } from '@/lib/query-keys';
import { fetchers } from '@/lib/queries';

export default function WordClassPage() {
  const t = useTranslations();
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  const rules = useQuery({ queryKey: vocabKeys.suffixRules, queryFn: fetchers.suffixRules });
  const families = useQuery({ queryKey: vocabKeys.families, queryFn: fetchers.families });
  const family = useQuery({
    queryKey: vocabKeys.family(openFamily ?? ''),
    queryFn: () => fetchers.family(openFamily as string),
    enabled: openFamily !== null,
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px]">{t('wordClass.title')}</h1>
          <p className="mt-1 max-w-prose text-[14px] text-[var(--text-muted)]">
            {t('wordClass.subtitle')}
          </p>
        </div>
        <Link href="/word-class/practice">
          <Button>{t('wordClass.practice')}</Button>
        </Link>
      </header>

      <section aria-labelledby="families-heading" className="flex flex-col gap-3">
        <h2 id="families-heading" className="text-[18px]">
          {t('wordClass.families')}
        </h2>

        {families.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_unused, index) => (
              <Skeleton key={index} className="h-[96px] w-full rounded-[var(--r-md)]" />
            ))}
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : families.isError || !families.data ? (
          <EmptyState
            title={t('common.errorTitle')}
            body={t('common.errorBody')}
            action={<Button onClick={() => void families.refetch()}>{t('common.retry')}</Button>}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {families.data.map((entry) => {
              const open = openFamily === entry.rootSlug;
              return (
                <li key={entry.rootSlug}>
                  <Card className={open ? 'border-[var(--primary)]' : ''}>
                    <CardBody className="pt-4">
                      <button
                        type="button"
                        className="w-full text-left"
                        aria-expanded={open}
                        onClick={() => setOpenFamily(open ? null : entry.rootSlug)}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[17px] font-medium">{entry.rootSlug}</span>
                          <Badge tone={entry.knownCount > 0 ? 'success' : 'neutral'}>
                            {t('wordClass.members', { count: entry.memberCount })}
                          </Badge>
                        </span>
                        <span className="mt-1 block text-[13px] text-[var(--text-muted)]">
                          {entry.glossVi}
                        </span>
                      </button>

                      {open ? (
                        <div className="mt-3 border-t border-[var(--border)] pt-3">
                          {family.isPending ? (
                            <Skeleton className="h-16 w-full" />
                          ) : family.data ? (
                            <ul className="flex flex-col gap-1.5">
                              {family.data.members.map((member) => (
                                <li
                                  key={`${member.slug}-${member.pos}`}
                                  className="flex flex-wrap items-center gap-2 text-[14px]"
                                >
                                  <Link href={`/word/${member.slug}`} className="hover:underline">
                                    {member.lemma}
                                  </Link>
                                  <Badge tone="primary">{member.posLabelVi}</Badge>
                                  {member.suffix ? (
                                    <span className="text-[12px] text-[var(--text-subtle)]">
                                      {member.suffix}
                                    </span>
                                  ) : null}
                                  {member.learnState ? (
                                    <span aria-label="Đã có trong bộ từ" title="Đã có trong bộ từ">
                                      🌿
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="suffix-heading">
        <Card>
          <CardHeader>
            <CardTitle id="suffix-heading">{t('wordClass.suffixTable')}</CardTitle>
          </CardHeader>
          <CardBody>
            {rules.isPending ? (
              <Skeleton className="h-[240px] w-full" />
            ) : rules.isError || !rules.data ? (
              <EmptyState
                title={t('common.errorTitle')}
                body={t('common.errorBody')}
                action={<Button onClick={() => void rules.refetch()}>{t('common.retry')}</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
                  <caption className="sr-only">{t('wordClass.suffixTable')}</caption>
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[13px] text-[var(--text-muted)]">
                      <th scope="col" className="py-2 pr-3">
                        Hậu tố
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Từ loại
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        {t('wordClass.reliability')}
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        {t('wordClass.examples')}
                      </th>
                      <th scope="col" className="py-2">
                        {t('wordClass.exceptions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.data.map((rule) => (
                      <tr key={rule.suffix} className="border-b border-[var(--border)] align-top">
                        <th scope="row" className="py-2 pr-3 font-medium">
                          {rule.suffix}
                        </th>
                        <td className="py-2 pr-3">
                          <Badge tone="primary">{rule.posLabelVi}</Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className="inline-block h-1.5 w-16 overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-alt)] align-middle"
                            role="img"
                            aria-label={`${Math.round(rule.reliability * 100)}%`}
                          >
                            <span
                              className="block h-full bg-[var(--primary)]"
                              style={{ width: `${rule.reliability * 100}%` }}
                            />
                          </span>
                          <span className="ml-2 text-[12px] text-[var(--text-subtle)]">
                            {Math.round(rule.reliability * 100)}%
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-[var(--text-muted)]">
                          {rule.examples.join(', ')}
                        </td>
                        <td className="py-2 text-[var(--text-subtle)]">
                          {rule.exceptions.length > 0 ? rule.exceptions.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
