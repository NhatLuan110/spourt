'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { CEFR_LEVELS, CEFR_LABEL_VI, DAILY_GOAL_PRESETS, LEARNING_GOALS } from '@sprout/shared';
import type { CefrLevel } from '@sprout/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

type Minutes = (typeof DAILY_GOAL_PRESETS)[number]['minutes'];

/** §7.1 — goals, then daily commitment, then level. Placement test comes next. */
export default function WelcomePage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<Minutes>(15);
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [takeTest, setTakeTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleGoal = (key: string) =>
    setGoals((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/me/onboarding', {
        goals,
        dailyGoalMinutes: minutes,
        selfAssessedLevel: level,
        takePlacementTest: takeTest,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.replace('/dashboard');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[640px] py-6">
      <ol className="mb-6 flex items-center gap-2" aria-label="Tiến độ thiết lập">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            aria-current={step === index ? 'step' : undefined}
            className={cn(
              'h-1.5 flex-1 rounded-[var(--r-full)]',
              index <= step ? 'bg-[var(--primary)]' : 'bg-[var(--surface-sunken)]',
            )}
          />
        ))}
      </ol>

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-[24px]">{t('onboarding.goalsTitle')}</CardTitle>
            <CardDescription>{t('onboarding.goalsSubtitle')}</CardDescription>
          </CardHeader>
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2">
              {LEARNING_GOALS.map((goal) => {
                const selected = goals.includes(goal.key);
                return (
                  <button
                    key={goal.key}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleGoal(goal.key)}
                    className={cn(
                      'flex items-center gap-2 rounded-[var(--r-md)] border px-4 py-3 text-left text-[15px] transition-colors',
                      selected
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]',
                    )}
                  >
                    <span aria-hidden="true">{selected ? '✓' : '+'}</span>
                    {goal.labelVi}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <Button disabled={goals.length === 0} onClick={() => setStep(1)}>
                {t('common.continue')}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-[24px]">{t('onboarding.timeTitle')}</CardTitle>
            <CardDescription>{t('onboarding.timeSubtitle')}</CardDescription>
          </CardHeader>
          <CardBody>
            <div
              role="radiogroup"
              aria-label={t('onboarding.timeTitle')}
              className="grid gap-2 sm:grid-cols-2"
            >
              {DAILY_GOAL_PRESETS.map((preset) => {
                const selected = minutes === preset.minutes;
                return (
                  <button
                    key={preset.minutes}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMinutes(preset.minutes)}
                    className={cn(
                      'rounded-[var(--r-md)] border px-4 py-3 text-left transition-colors',
                      selected
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]',
                    )}
                  >
                    <span className="block text-[16px] font-medium">
                      {t('onboarding.minutesPerDay', { minutes: preset.minutes })}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-[var(--text-muted)]">
                      {preset.newWordsPerDay} từ mới · {preset.xp} XP
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                {t('common.back')}
              </Button>
              <Button onClick={() => setStep(2)}>{t('common.continue')}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-[24px]">{t('onboarding.levelTitle')}</CardTitle>
            <CardDescription>{t('onboarding.levelSubtitle')}</CardDescription>
          </CardHeader>
          <CardBody>
            <div role="radiogroup" aria-label={t('onboarding.levelTitle')} className="grid gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={takeTest}
                onClick={() => {
                  setTakeTest(true);
                  setLevel(null);
                }}
                className={cn(
                  'rounded-[var(--r-md)] border px-4 py-3 text-left transition-colors',
                  takeTest
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]',
                )}
              >
                {t('onboarding.levelUnknown')}
              </button>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {CEFR_LEVELS.map((entry) => {
                  const selected = !takeTest && level === entry;
                  return (
                    <button
                      key={entry}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={CEFR_LABEL_VI[entry]}
                      onClick={() => {
                        setTakeTest(false);
                        setLevel(entry);
                      }}
                      className={cn(
                        'rounded-[var(--r-md)] border py-3 text-center font-medium transition-colors',
                        selected
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                          : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)]',
                      )}
                    >
                      {entry}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <p role="alert" className="mt-4 text-[14px] text-[var(--danger)]">
                ✗ {error}
              </p>
            ) : null}

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t('common.back')}
              </Button>
              <Button
                loading={saving}
                disabled={!takeTest && level === null}
                onClick={() => void finish()}
              >
                {t('onboarding.finish')}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
