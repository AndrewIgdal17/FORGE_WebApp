import type { ReactElement } from 'react';
import { formatCurrency } from '@/lib/format';
import { COMPOSITION_COLORS, formatCompact } from '@/lib/results-utils';

export interface CompositionSegment {
  label: string;
  value: number;
  color?: string;
}

export interface CompositionBarProps {
  segments: Array<CompositionSegment>;
}

function segmentColor(color: string | undefined, index: number): string {
  if (color) return color;
  const last = COMPOSITION_COLORS.length - 1;
  return COMPOSITION_COLORS[Math.min(index, last)] ?? COMPOSITION_COLORS[0] ?? '#0066cc';
}

export function CompositionBar({ segments }: CompositionBarProps): ReactElement {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments
    .map((segment, index) => ({
      segment,
      index,
      pct: total > 0 ? (segment.value / total) * 100 : 0,
    }))
    .filter((item) => item.pct >= 0.5);

  const legend = segments
    .map((segment) => `${segment.label} ${formatCompact(segment.value)}`)
    .join(' · ');

  return (
    <div>
      <div className="flex h-6 overflow-hidden rounded-md">
        {visible.map(({ segment, index, pct }) => (
          <div
            key={`${segment.label}-${index}`}
            className="flex min-w-0 items-center justify-center overflow-hidden px-1 text-[0.6rem] font-semibold whitespace-nowrap text-white"
            style={{
              flexGrow: segment.value,
              flexBasis: 0,
              background: segmentColor(segment.color, index),
            }}
            title={`${segment.label}: ${formatCurrency(segment.value, 0)} (${pct.toFixed(1)}%)`}
          >
            {pct > 12 ? segment.label : null}
          </div>
        ))}
      </div>
      {legend ? (
        <p className="mt-1 text-xs text-muted-foreground">{legend}</p>
      ) : null}
    </div>
  );
}
