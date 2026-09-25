import type { RewardSummary } from '@sprout/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * §3.5 — the calm celebration: a line of text and a soft badge, never confetti.
 * Only the things that actually changed are mentioned.
 */
export function RewardBanner({
  reward,
  headline,
  className,
}: {
  reward: RewardSummary;
  /** Optional lead line, e.g. "8/10 đúng", shown above the XP row. */
  headline?: string;
  className?: string;
}) {
  const notes: string[] = [];
  if (reward.leveledUp) notes.push(`Lên cấp ${reward.level}`);
  if (reward.treeGrew) notes.push('Cây vừa lớn thêm một bậc');
  if (reward.streak.milestoneReached)
    notes.push(`Chuỗi ${reward.streak.milestoneReached} ngày`);
  if (reward.streak.freezeUsed) notes.push('Đã dùng một streak freeze để giữ chuỗi');
  if (reward.cappedByDailyReviewLimit) notes.push('Đã chạm trần XP ôn tập hôm nay');

  return (
    <div
      className={cn(
        'rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--primary-soft)] p-4',
        className,
      )}
      role="status"
    >
      {headline ? <p className="mb-1 text-[18px] font-semibold">{headline}</p> : null}

      <p className="flex flex-wrap items-center gap-2 text-[16px]">
        <span aria-hidden="true">🌱</span>
        <strong className="font-semibold">+{reward.xpEarned} XP</strong>
        {reward.coinsEarned > 0 ? <span>· +{reward.coinsEarned} 🪙</span> : null}
        <span className="text-[var(--text-muted)]">
          · {reward.totalXp} XP · chuỗi {reward.streak.current} ngày
        </span>
      </p>

      {notes.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {notes.map((note) => (
            <li key={note}>
              <Badge tone="success">{note}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {reward.achievementsUnlocked.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {reward.achievementsUnlocked.map((achievement) => (
            <li key={achievement.slug}>
              <Badge tone="accent">
                <span aria-hidden="true">{achievement.icon}</span> {achievement.nameVi}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
