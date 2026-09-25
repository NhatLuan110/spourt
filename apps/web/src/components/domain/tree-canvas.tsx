import { cn } from '@/lib/utils';
import type { TreeHealth } from '@sprout/shared';

export interface TreeCanvasProps {
  /** 1..6, from §3.5. */
  stage: number;
  /** One flower per unlocked achievement. */
  flowers?: number;
  /** One bird per completed week of streak. */
  birds?: number;
  health?: TreeHealth;
  className?: string;
  /** Describes the tree for screen readers, e.g. "Cây non, 3 bông hoa". */
  ariaLabel: string;
}

const LEAF_TONE: Record<TreeHealth, { canopy: string; canopyDeep: string }> = {
  healthy: { canopy: 'var(--primary)', canopyDeep: 'var(--primary-active)' },
  // Missing one day yellows the leaves; nothing ever falls off (§3.5).
  yellowing: { canopy: '#93a558', canopyDeep: '#7d8f45' },
  wilting: { canopy: '#a99150', canopyDeep: '#8d7940' },
};

/**
 * §3.5 — the learning tree. It only ever grows: a missed day changes the leaf
 * colour, never the stage, because punishing a lapse is what makes people quit.
 */
export function TreeCanvas({
  stage,
  flowers = 0,
  birds = 0,
  health = 'healthy',
  className,
  ariaLabel,
}: TreeCanvasProps) {
  const clamped = Math.min(6, Math.max(1, Math.round(stage)));
  const tone = LEAF_TONE[health];

  return (
    <svg
      viewBox="0 0 240 200"
      className={cn('w-full h-auto', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <radialGradient id="sprout-sky" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="var(--accent-soft)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--accent-soft)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="120" cy="70" r="90" fill="url(#sprout-sky)" />

      {/* Ground line, always present so the tree never floats. */}
      <path
        d="M20 170 Q 120 158 220 170 L220 178 Q 120 168 20 178 Z"
        fill="var(--surface-sunken)"
      />
      <ellipse cx="120" cy="171" rx="52" ry="7" fill="var(--bark)" opacity="0.18" />

      {clamped === 1 ? <Seed /> : null}
      {clamped === 2 ? <Sprout tone={tone} /> : null}
      {clamped === 3 ? <Sapling tone={tone} /> : null}
      {clamped === 4 ? <FullTree tone={tone} /> : null}
      {clamped === 5 ? <AncientTree tone={tone} /> : null}
      {clamped === 6 ? <Garden tone={tone} /> : null}

      {clamped >= 3 ? <Flowers count={flowers} stage={clamped} /> : null}
      {clamped >= 3 ? <Birds count={birds} /> : null}
    </svg>
  );
}

function Seed() {
  return (
    <g>
      <ellipse cx="120" cy="163" rx="9" ry="7" fill="var(--bark)" />
      <path d="M114 161 Q120 155 126 161" stroke="var(--bark)" strokeWidth="1.5" fill="none" opacity="0.6" />
    </g>
  );
}

function Sprout({ tone }: { tone: { canopy: string; canopyDeep: string } }) {
  return (
    <g>
      <path d="M120 168 L120 138" stroke={tone.canopyDeep} strokeWidth="4" strokeLinecap="round" />
      <path
        d="M120 144 C 104 140, 98 126, 112 122 C 122 120, 122 136, 120 144 Z"
        fill={tone.canopy}
        className="leaf-hover"
      />
      <path
        d="M120 144 C 136 140, 142 126, 128 122 C 118 120, 118 136, 120 144 Z"
        fill={tone.canopyDeep}
        className="leaf-hover"
      />
    </g>
  );
}

function Sapling({ tone }: { tone: { canopy: string; canopyDeep: string } }) {
  return (
    <g>
      <path d="M120 170 L120 108" stroke="var(--bark)" strokeWidth="6" strokeLinecap="round" />
      <path d="M120 132 L104 118 M120 122 L136 110" stroke="var(--bark)" strokeWidth="3" strokeLinecap="round" />
      {[
        [104, 116],
        [136, 108],
        [120, 100],
        [110, 128],
        [132, 124],
        [120, 114],
      ].map(([x, y], index) => (
        <ellipse
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          rx="11"
          ry="7"
          fill={index % 2 === 0 ? tone.canopy : tone.canopyDeep}
          transform={`rotate(${index % 2 === 0 ? -22 : 18} ${x} ${y})`}
          className="leaf-hover"
        />
      ))}
    </g>
  );
}

function FullTree({ tone }: { tone: { canopy: string; canopyDeep: string } }) {
  return (
    <g>
      <path d="M120 170 L120 96" stroke="var(--bark)" strokeWidth="9" strokeLinecap="round" />
      <path d="M120 124 L100 106 M120 116 L142 100" stroke="var(--bark)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="120" cy="82" r="34" fill={tone.canopy} />
      <circle cx="94" cy="96" r="24" fill={tone.canopyDeep} />
      <circle cx="146" cy="94" r="26" fill={tone.canopyDeep} />
      <circle cx="120" cy="102" r="26" fill={tone.canopy} />
    </g>
  );
}

function AncientTree({ tone }: { tone: { canopy: string; canopyDeep: string } }) {
  return (
    <g>
      <path
        d="M112 170 Q 110 130 116 92 L128 92 Q 132 130 130 170 Z"
        fill="var(--bark)"
      />
      <path d="M120 118 L92 96 M120 108 L150 88" stroke="var(--bark)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="120" cy="70" r="40" fill={tone.canopy} />
      <circle cx="82" cy="90" r="28" fill={tone.canopyDeep} />
      <circle cx="158" cy="86" r="30" fill={tone.canopyDeep} />
      <circle cx="120" cy="96" r="30" fill={tone.canopy} />
    </g>
  );
}

function Garden({ tone }: { tone: { canopy: string; canopyDeep: string } }) {
  return (
    <g>
      <g transform="translate(-52 26) scale(0.6)">
        <path d="M120 170 L120 100" stroke="var(--bark)" strokeWidth="9" strokeLinecap="round" />
        <circle cx="120" cy="86" r="30" fill={tone.canopyDeep} />
      </g>
      <g transform="translate(56 30) scale(0.55)">
        <path d="M120 170 L120 104" stroke="var(--bark)" strokeWidth="9" strokeLinecap="round" />
        <circle cx="120" cy="90" r="28" fill={tone.canopyDeep} />
      </g>
      <AncientTree tone={tone} />
    </g>
  );
}

/** Each unlocked achievement blooms as one flower (§3.5). */
function Flowers({ count, stage }: { count: number; stage: number }) {
  const visible = Math.min(count, 12);
  const radius = stage >= 5 ? 44 : stage === 4 ? 36 : 24;
  const centreY = stage >= 5 ? 78 : stage === 4 ? 88 : 114;

  return (
    <g>
      {Array.from({ length: visible }, (_, index) => {
        // Deterministic placement: the same achievement count always looks the same.
        const angle = (index * 137.5 * Math.PI) / 180;
        const distance = radius * (0.45 + ((index % 4) * 0.16));
        const x = 120 + Math.cos(angle) * distance;
        const y = centreY + Math.sin(angle) * distance * 0.7;
        return (
          <g key={index} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            {[0, 72, 144, 216, 288].map((petal) => (
              <ellipse
                key={petal}
                cx="0"
                cy="-3"
                rx="1.8"
                ry="3.2"
                fill="var(--accent)"
                transform={`rotate(${petal})`}
              />
            ))}
            <circle r="1.6" fill="var(--accent-hover)" />
          </g>
        );
      })}
    </g>
  );
}

/** One bird lands for every seven day streak (§3.5). */
function Birds({ count }: { count: number }) {
  const visible = Math.min(count, 5);
  const spots = [
    [64, 54],
    [176, 60],
    [44, 92],
    [196, 96],
    [120, 34],
  ] as const;

  return (
    <g stroke="var(--bark)" strokeWidth="2" fill="none" strokeLinecap="round">
      {spots.slice(0, visible).map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x - 7} ${y} q 7 -6 7 0 q 0 -6 7 0`} />
      ))}
    </g>
  );
}
