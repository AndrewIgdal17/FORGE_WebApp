import { useState, type ReactElement } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface SensitivityTableProps {
  results: Record<string, unknown>;
}

interface SensitivityRow {
  key: string;
  label: string;
  bcr: number | null;
  netBenefit: number | null;
  excludedCosts: number | null;
  excludedBenefits: number | null;
}

const MAIN_VARIANTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'bcr_excluding_avoided_emissions', label: 'BCR excl. Avoided Emissions' },
  { key: 'bcr_excluding_wildfire_risk', label: 'BCR excl. Wildfire' },
  {
    key: 'bcr_excluding_wildfire_risk_and_outage_risk',
    label: 'BCR excl. Wildfire + Outage',
  },
];

const EXTRA_LABELS: Record<string, string> = {
  bcr_excluding_emissions: 'BCR excl. Emissions',
  bcr_excluding_avoided_emissions_and_emissions: 'BCR excl. Avoided Emissions + Emissions',
  bcr_excluding_outage_risk: 'BCR excl. Outage',
  bcr_excluding_linelosses: 'BCR excl. Line Losses',
};

const EXTRA_ORDER = [
  'bcr_excluding_emissions',
  'bcr_excluding_avoided_emissions_and_emissions',
  'bcr_excluding_outage_risk',
  'bcr_excluding_linelosses',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readFinite(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function labelForKey(key: string): string {
  const known = EXTRA_LABELS[key];
  if (known) return known;
  const suffix = key.startsWith('bcr_excluding_') ? key.slice('bcr_excluding_'.length) : key;
  const words = suffix.replace(/_and_/g, ' + ').replace(/_risk/g, '').replace(/_/g, ' ');
  const titled = words.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `BCR excl. ${titled}`;
}

function rowFromKey(
  bcr: Record<string, unknown>,
  key: string,
  label: string,
): SensitivityRow {
  const suffix = key.startsWith('bcr_excluding_') ? key.slice('bcr_excluding_'.length) : key;
  const totalCosts = readFinite(bcr, 'total_costs_pv');
  const totalBenefits = readFinite(bcr, 'total_benefits_pv');
  const remainingCosts = readFinite(bcr, `total_costs_excluding_${suffix}_pv`);
  const remainingBenefits = readFinite(bcr, `total_benefits_excluding_${suffix}_pv`);
  return {
    key,
    label,
    bcr: readFinite(bcr, key),
    netBenefit: readFinite(bcr, `net_benefit_excluding_${suffix}_pv`),
    excludedCosts:
      totalCosts != null && remainingCosts != null ? totalCosts - remainingCosts : null,
    excludedBenefits:
      totalBenefits != null && remainingBenefits != null
        ? totalBenefits - remainingBenefits
        : null,
  };
}

function extraKeys(bcr: Record<string, unknown>): string[] {
  const main = new Set(MAIN_VARIANTS.map((variant) => variant.key));
  return Object.keys(bcr)
    .filter((key) => key.startsWith('bcr_excluding_') && !main.has(key))
    .filter((key) => readFinite(bcr, key) != null)
    .sort((a, b) => {
      const aOrder = EXTRA_ORDER.indexOf(a);
      const bOrder = EXTRA_ORDER.indexOf(b);
      const aRank = aOrder === -1 ? EXTRA_ORDER.length : aOrder;
      const bRank = bOrder === -1 ? EXTRA_ORDER.length : bOrder;
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b);
    });
}

function bcrTone(value: number | null): string | undefined {
  if (value == null) return undefined;
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

function VariantTable({ rows }: { rows: SensitivityRow[] }): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Exclusion</th>
            <th className="py-2 pr-3 font-medium">BCR</th>
            <th className="py-2 pr-3 font-medium">Net Benefit (PV)</th>
            <th className="py-2 pr-3 font-medium">Excluded Costs (PV)</th>
            <th className="py-2 font-medium">Excluded Benefits (PV)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/60">
              <td className="py-2 pr-3">{row.label}</td>
              <td className={cn('py-2 pr-3 tabular-nums', bcrTone(row.bcr))}>
                {formatNumber(row.bcr, 3)}
              </td>
              <td
                className={cn(
                  'py-2 pr-3 tabular-nums',
                  row.netBenefit != null && row.netBenefit < 0 && 'text-red-600',
                )}
              >
                {formatCurrency(row.netBenefit, 0)}
              </td>
              <td className="py-2 pr-3 tabular-nums">{formatCurrency(row.excludedCosts, 0)}</td>
              <td className="py-2 tabular-nums">{formatCurrency(row.excludedBenefits, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SensitivityTable({ results }: SensitivityTableProps): ReactElement {
  const [moreOpen, setMoreOpen] = useState(false);
  const bcr = asRecord(results.bcr);
  const mainRows = MAIN_VARIANTS.map((variant) =>
    rowFromKey(bcr ?? {}, variant.key, variant.label),
  );
  const moreRows = bcr
    ? extraKeys(bcr).map((key) => rowFromKey(bcr, key, labelForKey(key)))
    : [];

  return (
    <div className="space-y-3">
      <VariantTable rows={mainRows} />
      {moreRows.length > 0 ? (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={moreOpen}
            onClick={() => {
              setMoreOpen((open) => !open);
            }}
          >
            <ChevronRight
              className={cn('size-4 transition-transform', moreOpen && 'rotate-90')}
              aria-hidden
            />
            More Sensitivity
          </button>
          {moreOpen ? (
            <div className="mt-2">
              <VariantTable rows={moreRows} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
