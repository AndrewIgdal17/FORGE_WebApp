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

const PERSPECTIVES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'bcr_societal', label: 'Societal BCR' },
  { key: 'bcr_ratepayer', label: 'Ratepayer BCR' },
  { key: 'bcr_utility', label: 'Utility BCR' },
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

function bcrTone(value: number | null): string | undefined {
  if (value == null) return undefined;
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

export function PerspectivesTable({ results }: PerspectivesTableProps): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PERSPECTIVES.map((perspective) => {
        const value = readBcr(results, perspective.key);
        return (
          <Card key={perspective.key} size="sm">
            <CardHeader>
              <CardDescription>{perspective.label}</CardDescription>
              <CardTitle className={cn('text-2xl tabular-nums', bcrTone(value))}>
                {formatNumber(value, 2)}
              </CardTitle>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
