'use client';

import { useState } from 'react';
import { CEFR_LEVELS, SKILLS, SKILL_LABEL_VI, TREE_STAGES } from '@sprout/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, CefrTag, SkillDot } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { TreeCanvas } from '@/components/domain/tree-canvas';
import { LeafProgressRing } from '@/components/domain/leaf-progress-ring';
import { StatPill, XpBar } from '@/components/domain/stat-pills';
import { ThemeToggle } from '@/components/layout/theme-toggle';

/** §3.6 — the component gallery. Every primitive is exercised in both themes. */
export default function DevUiPage() {
  const [ringValue, setRingValue] = useState(18);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[30px]">Design system</h1>
          <p className="text-[14px] text-[var(--text-muted)]">
            Các thành phần giao diện của Sprout. Đổi giao diện sáng/tối để kiểm tra tương phản.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ['bg', 'var(--bg)'],
            ['surface', 'var(--surface)'],
            ['surface-alt', 'var(--surface-alt)'],
            ['surface-sunken', 'var(--surface-sunken)'],
            ['border', 'var(--border)'],
            ['primary', 'var(--primary)'],
            ['primary-soft', 'var(--primary-soft)'],
            ['accent', 'var(--accent)'],
            ['accent-soft', 'var(--accent-soft)'],
            ['success', 'var(--success)'],
            ['warning', 'var(--warning)'],
            ['danger', 'var(--danger)'],
            ['info', 'var(--info)'],
            ['bark', 'var(--bark)'],
            ['moss', 'var(--moss)'],
            ['clay', 'var(--clay)'],
          ].map(([name, value]) => (
            <div key={name} className="overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
              <div className="h-14" style={{ backgroundColor: value }} />
              <p className="px-2 py-1.5 text-[12px] text-[var(--text-muted)]">{name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-2">
          <p className="text-[48px] leading-[1.15]">Học tiếng Anh 48</p>
          <p className="text-[30px]">Tiêu đề mục 30</p>
          <p className="text-[18px]">Đoạn văn 18 — chữ Việt có dấu đầy đủ</p>
          <p className="text-[16px] text-[var(--text-muted)]">Body 16 muted</p>
          <p className="ipa text-[20px]">IPA: /ˈbjuːtɪfl̩/ · /θɔːt/ · /ʃiː/ · /tʃeə(r)/ · /ˈreko:d/</p>
          <p className="font-[family-name:var(--font-mono)] text-[14px]">mono: word_id = cm4x9k2</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="danger">Danger</Button>
          <Button loading loadingLabel="Đang lưu">Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid max-w-[640px] gap-4 sm:grid-cols-2">
          <Input label="Email" placeholder="ban@vidu.com" />
          <Input label="Mật khẩu" type="password" hint="Ít nhất 8 ký tự" />
          <Input label="Có lỗi" defaultValue="sai" error="Email không hợp lệ" />
          <Input label="Vô hiệu hoá" disabled defaultValue="Không sửa được" />
        </div>
      </Section>

      <Section title="Badges and tags">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>neutral</Badge>
          <Badge tone="primary">primary</Badge>
          <Badge tone="accent">accent</Badge>
          <Badge tone="success">✓ đúng</Badge>
          <Badge tone="danger">✗ sai</Badge>
          <Badge tone="warning">gần đúng</Badge>
          <Badge tone="info">nghe</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CEFR_LEVELS.map((level) => (
            <CefrTag key={level} level={level} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {SKILLS.map((skill) => (
            <span key={skill} className="inline-flex items-center gap-2 text-[14px]">
              <SkillDot skill={skill} />
              {SKILL_LABEL_VI[skill]}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Progress">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <LeafProgressRing
              value={ringValue}
              max={30}
              label={`${ringValue}/30`}
              caption="XP"
              ariaLabel="Mục tiêu hôm nay"
            />
            <input
              type="range"
              min={0}
              max={30}
              value={ringValue}
              onChange={(event) => setRingValue(Number(event.target.value))}
              className="mt-3 w-full"
              aria-label="Điều chỉnh tiến độ mẫu"
            />
          </div>
          <LeafProgressRing value={30} max={30} label="30/30" caption="Đạt rồi" ariaLabel="Đã đạt mục tiêu" />
          <div className="w-[240px]">
            <XpBar level={4} xpIntoLevel={280} xpForNextLevel={400} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatPill icon="🔥" value="12 ngày" label="" tone="accent" />
          <StatPill icon="⭐" value={1840} label="XP" />
          <StatPill icon="🪙" value={64} label="" />
        </div>
      </Section>

      <Section title="Tree, all six stages">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {TREE_STAGES.map((stage) => (
            <figure key={stage.stage} className="rounded-[var(--r-lg)] border border-[var(--border)] p-2">
              <TreeCanvas
                stage={stage.stage}
                flowers={stage.stage * 2}
                birds={stage.stage}
                ariaLabel={`Cây giai đoạn ${stage.nameVi}`}
              />
              <figcaption className="mt-1 text-center text-[12px] text-[var(--text-muted)]">
                {stage.emoji} {stage.nameVi} · {stage.minXp} XP
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 md:max-w-[540px]">
          {(['healthy', 'yellowing', 'wilting'] as const).map((health) => (
            <figure key={health} className="rounded-[var(--r-lg)] border border-[var(--border)] p-2">
              <TreeCanvas stage={4} health={health} ariaLabel={`Cây ${health}`} />
              <figcaption className="mt-1 text-center text-[12px] text-[var(--text-muted)]">
                {health}
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="Cards, empty and loading states">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Thẻ nội dung</CardTitle>
              <CardDescription>Mô tả ngắn nằm dưới tiêu đề.</CardDescription>
            </CardHeader>
            <CardBody>
              <p className="text-[14px] text-[var(--text-muted)]">Nội dung của thẻ.</p>
            </CardBody>
          </Card>
          <Card>
            <EmptyState
              title="Chưa có thẻ nào"
              body="Học 5 từ đầu tiên để bắt đầu hàng đợi ôn tập."
              action={<Button size="sm">Học từ mới</Button>}
            />
          </Card>
          <CardSkeleton />
        </div>
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 border-b border-[var(--border)] pb-2 text-[20px]">{title}</h2>
      {children}
    </section>
  );
}
