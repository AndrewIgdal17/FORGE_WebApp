import type { ReactElement } from 'react';
import { ArrowRight } from 'lucide-react';
import { getStripConfig, readFigureValue, type StripFigure } from '@/data/strip-config';
import { useNavigation } from '@/hooks/use-navigation';
import { formatCurrency, formatNumber, formatSignedCurrencyValue, formatSignedNumberValue } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface ContributionStripProps {
  results: Record<string, unknown> | null;
  savedResults: Record<string, unknown> | null;
  onNavigateResults: (subItemId: string) => void;
}

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

function figureUnit(figure: StripFigure): string {
  return 'unit' in figure && figure.unit ? ` ${figure.unit}` : '';
}

function figureDecimals(figure: StripFigure): number {
  return 'decimals' in figure && figure.decimals != null ? figure.decimals : 0;
}

function formatFigure(value: number | null, figure: StripFigure): string {
  if (value === null) return '—';
  const unit = figureUnit(figure);
  switch (figure.format) {
    case 'currency':
      return formatCurrency(value, 0) + unit;
    case 'ratio':
      return formatNumber(value, 3) + unit;
    case 'percent':
      return formatNumber(value * 100, 1) + '%' + unit;
    case 'number':
      return formatNumber(value, figureDecimals(figure)) + unit;
  }
}

function figureColor(figure: StripFigure, value: number | null): string {
  const colorByThreshold = figure.source === 'path' && figure.colorByThreshold === true;
  if (!colorByThreshold || value === null) return 'text-slate-900';
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

function DeltaChip({ current, saved, figure }: {
  current: number | null;
  saved: number | null;
  figure: StripFigure;
}): ReactElement | null {
  if (current === null || saved === null) return null;
  const delta = current - saved;
  if (Math.abs(delta) < 0.005) return null;

  const isRatio = figure.format === 'ratio';
  const label = isRatio
    ? (delta > 0 ? '+' : '') + formatNumber(delta, 3)
    : figure.format === 'number'
      ? formatSignedNumberValue(delta, figureDecimals(figure)) + figureUnit(figure)
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

  const colsClass = GRID_COLS[config.figures.length] ?? 'grid-cols-3';

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
      <div className={cn('grid divide-x divide-slate-100', colsClass)}>
        {config.figures.map((figure) => {
          const value = readFigureValue(figure, results);
          return (
            <div key={figure.label} className="px-4 py-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
                {figure.label}
              </p>
              <p className={cn('mt-0.5 text-lg font-bold tabular-nums', figureColor(figure, value))}>
                {formatFigure(value, figure)}
              </p>
              <DeltaChip
                current={value}
                saved={savedResults ? readFigureValue(figure, savedResults) : null}
                figure={figure}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
