import { cn } from '@/lib/utils';
import { CEFR_LABEL_VI } from '@sprout/shared';
import type { CefrLevel, Skill } from '@sprout/shared';

const TONE_STYLES = {
  neutral: 'bg-[var(--surface-alt)] text-[var(--text-muted)] border-[var(--border)]',
  primary: 'bg-[var(--primary-soft)] text-[var(--primary)] border-transparent',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-transparent',
  success: 'bg-[var(--success-soft)] text-[var(--success)] border-transparent',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border-transparent',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent',
  info: 'bg-[var(--info-soft)] text-[var(--info)] border-transparent',
} as const;

export type BadgeTone = keyof typeof TONE_STYLES;

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--r-full)] border text-[12px] font-medium',
        TONE_STYLES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** §3.6 CefrTag — each level keeps one colour across the whole app. */
const CEFR_TONE: Record<CefrLevel, BadgeTone> = {
  A1: 'neutral',
  A2: 'info',
  B1: 'primary',
  B2: 'success',
  C1: 'accent',
  C2: 'warning',
};

export function CefrTag({ level, withLabel = false }: { level: CefrLevel; withLabel?: boolean }) {
  return (
    <Badge tone={CEFR_TONE[level]} title={CEFR_LABEL_VI[level]}>
      {level}
      {withLabel ? <span className="font-normal">· {CEFR_LABEL_VI[level]}</span> : null}
    </Badge>
  );
}

const SKILL_TONE: Record<Skill, string> = {
  VOCABULARY: 'var(--primary)',
  LISTENING: 'var(--info)',
  SPEAKING: 'var(--clay)',
  WRITING: 'var(--bark)',
  READING: 'var(--moss)',
  GRAMMAR: 'var(--accent)',
};

export function SkillDot({ skill }: { skill: Skill }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: SKILL_TONE[skill] }}
    />
  );
}
