'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MeResponse, UpdateSettingsInput } from '@sprout/shared';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CefrTag } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export default function SettingsPage() {
  const t = useTranslations();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: UpdateSettingsInput) => api.patch<MeResponse>('/me/settings', input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.me, updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
  });

  if (!user) return null;
  const { settings, profile } = user;

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <h1 className="text-[30px]">{t('nav.settings')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center gap-3 text-[14px] text-[var(--text-muted)]">
          <span className="text-[var(--text)]">{profile.displayName}</span>
          <CefrTag level={profile.currentLevel as never} withLabel />
          <span>Múi giờ: {profile.timezone}</span>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mục tiêu hằng ngày</CardTitle>
          <CardDescription>
            Ngày học của bạn bắt đầu lúc {settings.dayRolloverHour}:00 theo giờ {profile.timezone}.
          </CardDescription>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Phút mỗi ngày"
            value={settings.dailyGoalMinutes}
            min={5}
            max={240}
            onCommit={(value) => mutation.mutate({ dailyGoalMinutes: value })}
          />
          <NumberField
            label="XP mỗi ngày"
            value={settings.dailyGoalXp}
            min={5}
            max={1000}
            onCommit={(value) => mutation.mutate({ dailyGoalXp: value })}
          />
          <NumberField
            label="Từ mới mỗi ngày"
            value={settings.newWordsPerDay}
            min={0}
            max={100}
            onCommit={(value) => mutation.mutate({ newWordsPerDay: value })}
          />
          <NumberField
            label="Thẻ ôn tối đa mỗi ngày"
            value={settings.maxReviewsPerDay}
            min={10}
            max={500}
            onCommit={(value) => mutation.mutate({ maxReviewsPerDay: value })}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hiển thị</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[15px]">{t('common.theme')}</span>
            <ThemeToggle />
          </div>
          <ToggleRow
            label="Hiện phiên âm IPA"
            checked={settings.showIpa}
            onChange={(value) => mutation.mutate({ showIpa: value })}
          />
          <ToggleRow
            label="Tự phát âm thanh"
            checked={settings.autoPlayAudio}
            onChange={(value) => mutation.mutate({ autoPlayAudio: value })}
          />
          <ToggleRow
            label="Chế độ học yên tĩnh (ẩn XP, streak, bảng xếp hạng)"
            checked={settings.quietMode}
            onChange={(value) => mutation.mutate({ quietMode: value })}
          />
        </CardBody>
      </Card>

      <div
        aria-live="polite"
        className="text-[14px] text-[var(--success)]"
      >
        {saved ? '✓ Đã lưu' : ''}
        {mutation.isError ? (
          <span className="text-[var(--danger)]">✗ {t('errors.UNKNOWN')}</span>
        ) : null}
      </div>

      <div>
        <Button variant="secondary" onClick={() => void signOut()}>
          {t('common.signOut')}
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number(draft);
          if (Number.isFinite(parsed) && parsed >= min && parsed <= max && parsed !== value) {
            onCommit(parsed);
          } else {
            setDraft(String(value));
          }
        }}
        className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-3"
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[15px]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-[var(--r-full)] transition-colors ${
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--surface-sunken)]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-[left] ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
