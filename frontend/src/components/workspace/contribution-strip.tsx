import type { ReactElement } from 'react';
import { ArrowRight } from 'lucide-react';
import { getStripConfig, type StripFigure } from '@/data/strip-config';
import { useNavigation } from '@/hooks/use-navigation';
import { formatCurrency, formatNumber, formatSignedCurrencyValue } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';

export interface ContributionStripProps {
  results: Record<string, unknown> | null;
  savedResults: Record<string, unknown> | null;
  onNavigateResults: (subItemId: string) => void;
}

function readFinite(results: Record<string, unknown> | null, path: string): number | null {
  if (!results) return null;
  const value = getValueAtPath(results, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatFigure(value: number | null, format: StripFigure['format']): string {
  if (value === null) return '—';
  switch (format) {
    case 'currency':
      return formatCurrency(value, 0);
    case 'ratio':
      return formatNumber(value, 3);
    case 'percent':
      return formatNumber(value * 100, 1) + '%';
    case 'number':
      return formatNumber(value, 0);
  }
}

function figureColor(figure: StripFigure, value: number | null): string {
  if (!figure.colorByThreshold || value === null) return 'text-slate-900';
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

function DeltaChip({ current, saved, format }: {
  current: number | null;
  saved: number | null;
  format: StripFigure['format'];
}): ReactElement | null {
  if (current === null || saved === null) return null;
  const delta = current - saved;
  if (Math.abs(delta) < 0.005) return null;

  const isRatio = format === 'ratio';
  const label = isRatio
    ? (delta > 0 ? '+' : '') + formatNumber(delta, 3)
    : formatSignedCurrencyValue(delta, 0);
  const color = isRatio
    ? (delta > 0 ? 'text-green-600' : 'text-red-600')
    : (delta > 0 ? 'text-red-600' : 'text-green-600'); // higher cost = bad

  return (
    <span className={cn('text-[0.65rem] font-medium tabular-nums', color)}>
      {label}
    </span>
  );
}

export function ContributionStrip({
  results,
  savedResults,
  onNavigateResults,
}: ContributionStripProps): ReactElement | null {
  const { subItemId } = useNavigation();
  if (!subItemId) return null;
  const config = getStripConfig(subItemId);
  if (!config) return null;

  if (!results) {
    return (
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-400">{config.title}</p>
        <p className="mt-1 text-sm text-slate-500">
          Run a calculation to see this section's contribution.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <p className="text-xs font-medium text-slate-400">{config.title}</p>
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-forge-primary hover:underline"
          onClick={() => onNavigateResults(config.resultsView)}
        >
          View in Results
          <ArrowRight className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {config.figures.map((figure) => {
          const value = readFinite(results, figure.path);
          return (
            <div key={figure.path} className="px-4 py-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
                {figure.label}
              </p>
              <p className={cn('mt-0.5 text-lg font-bold tabular-nums', figureColor(figure, value))}>
                {formatFigure(value, figure.format)}
              </p>
              <DeltaChip
                current={value}
                saved={readFinite(savedResults, figure.path)}
                format={figure.format}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
