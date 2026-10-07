import type { ReactElement } from 'react';
import { formatCurrency, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface DeltaDisplayProps {
  value: number;
  baselineValue: number;
  format: 'currency' | 'number' | 'number2' | 'number3' | 'text';
  showDelta: boolean;
  showPercentDelta: boolean;
  /** Cost metrics use avoided-cost Δ (baseline − scenario). Benefits and BCR stay scenario − baseline. */
  invertDelta?: boolean;
}

function decimalsFor(format: DeltaDisplayProps['format']): number {
  if (format === 'number3') return 3;
  if (format === 'number2') return 2;
  return 0;
}

export function formatComparisonValue(
  value: unknown,
  format: DeltaDisplayProps['format'],
): string {
  if (value === undefined || value === null) return 'N/A';
  if (format === 'text') return value === '' ? '—' : String(value);
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (format === 'currency') return formatCurrency(num, 0);
  return formatNumber(num, decimalsFor(format));
}

function formatSigned(value: number, format: DeltaDisplayProps['format']): string {
  const abs =
    format === 'currency'
      ? formatCurrency(Math.abs(value), 0)
      : formatNumber(Math.abs(value), decimalsFor(format));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function tone(value: number): string {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-muted-foreground';
}

function percentLabel(delta: number, baselineValue: number): string {
  if (baselineValue === 0) return '—';
  const pct = (delta / baselineValue) * 100;
  if (!Number.isFinite(pct)) return '—';
  const text = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return text;
}

export function DeltaDisplay({
  value,
  baselineValue,
  format,
  showDelta,
  showPercentDelta,
  invertDelta = false,
}: DeltaDisplayProps): ReactElement {
  const supportsDelta = format !== 'text';
  const delta = invertDelta ? baselineValue - value : value - baselineValue;
  const percent = percentLabel(delta, baselineValue);

  return (
    <div className="flex flex-col items-end gap-0.5 tabular-nums">
      <span>{formatComparisonValue(value, format)}</span>
      {supportsDelta && showDelta ? (
        <span className={cn('text-xs', tone(delta))}>Δ {formatSigned(delta, format)}</span>
      ) : null}
      {supportsDelta && showPercentDelta ? (
        <span className={cn('text-xs', percent === '—' ? 'text-muted-foreground' : tone(delta))}>
          %Δ {percent}
        </span>
      ) : null}
    </div>
  );
}
