import type { ReactElement } from 'react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface PerspectivesTableProps {
  results: Record<string, unknown>;
}

const PRIMARY: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'bcr_societal', label: 'Societal BCR' },
  { key: 'bcr_ratepayer', label: 'Ratepayer BCR' },
  { key: 'bcr_utility', label: 'Utility BCR' },
];

const SECONDARY: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'bcr_excluding_avoided_emissions', label: 'BCR excl. Avoided Emissions' },
  { key: 'bcr_excluding_wildfire_risk', label: 'BCR excl. Wildfire' },
  {
    key: 'bcr_excluding_wildfire_risk_and_outage_risk',
    label: 'BCR excl. Wildfire + Outage',
  },
];

function readBcr(results: Record<string, unknown>, key: string): number | null {
  const bcr = results.bcr;
  if (!bcr || typeof bcr !== 'object' || Array.isArray(bcr)) return null;
  const value = (bcr as Record<string, unknown>)[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function bcrTone(value: number | null): string {
  if (value == null) return 'text-slate-400';
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

function bcrBg(value: number | null): string {
  if (value == null) return '';
  return value >= 1 ? 'bg-green-50 ring-green-200/60' : 'bg-red-50 ring-red-200/60';
}

export function PerspectivesTable({ results }: PerspectivesTableProps): ReactElement {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PRIMARY.map((perspective) => {
          const value = readBcr(results, perspective.key);
          return (
            <Card key={perspective.key} className={cn('ring-1', bcrBg(value))}>
              <CardHeader>
                <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {perspective.label}
                </CardDescription>
                <CardTitle className={cn('text-3xl font-bold tabular-nums', bcrTone(value))}>
                  {formatNumber(value, 3)}
                </CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SECONDARY.map((perspective) => {
          const value = readBcr(results, perspective.key);
          return (
            <Card key={perspective.key} size="sm" className="opacity-80">
              <CardHeader>
                <CardDescription className="text-xs text-slate-400">
                  {perspective.label}
                </CardDescription>
                <CardTitle className={cn('text-lg tabular-nums', bcrTone(value))}>
                  {formatNumber(value, 2)}
                </CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
