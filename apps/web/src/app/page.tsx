'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card';
import { TreeCanvas } from '@/components/domain/tree-canvas';

export default function LandingPage() {
  const t = useTranslations();

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="contour-bg pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="relative mx-auto flex max-w-[1200px] items-center justify-between px-4 py-5 md:px-8">
        <span className="flex items-center gap-2 text-[20px] font-semibold">
          <span aria-hidden="true">🌱</span>
          <span className="font-[family-name:var(--font-heading)]">{t('app.name')}</span>
        </span>
        <Link href="/login">
          <Button variant="ghost" size="sm">
            {t('auth.login')}
          </Button>
        </Link>
      </header>

      <section className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-16 pt-6 md:grid-cols-2 md:px-8 md:pt-14">
        <div>
          <h1 className="text-[36px] leading-[1.15] md:text-[48px]">{t('landing.heroTitle')}</h1>
          <p className="mt-5 max-w-[52ch] text-[18px] text-[var(--text-muted)]">
            {t('landing.heroBody')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register">
              <Button size="lg">{t('landing.ctaPrimary')}</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">
                {t('landing.ctaSecondary')}
              </Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[420px]">
          <TreeCanvas stage={5} flowers={6} birds={3} ariaLabel="Cây học tập ở giai đoạn cổ thụ" />
        </div>
      </section>

      <section className="relative mx-auto grid max-w-[1200px] gap-4 px-4 pb-20 md:grid-cols-3 md:px-8">
        {[
          {
            icon: '🎤',
            title: t('landing.featureSpeakingTitle'),
            body: t('landing.featureSpeakingBody'),
          },
          { icon: '🌿', title: t('landing.featureSrsTitle'), body: t('landing.featureSrsBody') },
          { icon: '📖', title: t('landing.featureTutorTitle'), body: t('landing.featureTutorBody') },
        ].map((feature) => (
          <Card key={feature.title}>
            <CardBody className="pt-5">
              <span aria-hidden="true" className="text-[24px]">
                {feature.icon}
              </span>
              <CardTitle className="mt-2">{feature.title}</CardTitle>
              <CardDescription>{feature.body}</CardDescription>
            </CardBody>
          </Card>
        ))}
      </section>
    </main>
  );
}
