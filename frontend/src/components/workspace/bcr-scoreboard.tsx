import type { ReactElement } from 'react';
import { formatNumber } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';

export interface BcrScoreboardProps {
  results: Record<string, unknown> | null;
}

function readRatio(results: Record<string, unknown> | null, path: string): number | null {
  if (!results) return null;
  const value = getValueAtPath(results, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ratioColor(value: number | null): string {
  if (value == null) return 'text-slate-400';
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

export function BcrScoreboard({ results }: BcrScoreboardProps): ReactElement {
  const societal = readRatio(results, 'bcr.bcr_societal');
  const ratepayer = readRatio(results, 'bcr.bcr_ratepayer');
  const utility = readRatio(results, 'bcr.bcr_utility');

  if (!results) {
    return (
      <div className="flex items-baseline gap-1 text-xs text-slate-400">
        <span>Not calculated</span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-3">
      <span className={cn('text-lg font-bold tabular-nums', ratioColor(societal))}>
        {formatNumber(societal, 2)}
      </span>
      <div className="flex items-baseline gap-2 text-xs text-slate-500">
        <span>
          Rp <span className={cn('font-semibold tabular-nums', ratioColor(ratepayer))}>
            {formatNumber(ratepayer, 2)}
          </span>
        </span>
        <span>
          Ut <span className={cn('font-semibold tabular-nums', ratioColor(utility))}>
            {formatNumber(utility, 2)}
          </span>
        </span>
      </div>
    </div>
  );
}
