import { useState, type ReactElement } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { PERSPECTIVE_DEFINITIONS } from '@/components/results/perspective-toggle';
import {
  PERSPECTIVE_CATEGORIES,
  type PerspectiveCategoryItem,
} from '@/components/results/results-overview';
import { TaxonomyCard } from '@/components/results/taxonomy-card';
import {
  cardValues,
  positiveItems,
  readTaxonomyItems,
  resolveResultById,
  type TaxonomyItemView,
} from '@/components/results/taxonomy-view';
import { formatCurrency, formatNumber } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';

export type LedgerSide = 'cost' | 'benefit';

export interface CategoryLedgerProps {
  results: Record<string, unknown>;
  taxonomy?: Record<string, unknown>;
  perspective: PerspectiveKey;
  side: LedgerSide;
}

interface CategoryRow {
  key: string;
  label: string;
  value: number;
}

const COST_BAR = '#dc2626';
const BENEFIT_BAR = '#059669';

const TOTAL_PATHS: Record<PerspectiveKey, { costs: string; benefits: string }> = {
  societal: {
    costs: 'summary.total_costs_pv',
    benefits: 'summary.total_benefits_pv',
  },
  ratepayer: {
    costs: 'bcr.ratepayer_costs_pv',
    benefits: 'bcr.ratepayer_benefits_pv',
  },
  utility: {
    costs: 'bcr.utility_costs_pv',
    benefits: 'bcr.utility_benefits_pv',
  },
};

function readNumber(results: Record<string, unknown>, path: string): number | null {
  const value = getValueAtPath(results, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function formatAxisCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return formatCurrency(value, 0);
}

function formatTooltipCurrency(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  return formatCurrency(numeric, 0);
}

function ratioClass(value: number | null): string {
  if (value == null) return 'text-slate-400';
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

function loadRows(
  results: Record<string, unknown>,
  items: PerspectiveCategoryItem[],
): CategoryRow[] {
  return items
    .map((item) => ({
      key: item.key,
      label: item.label,
      value: readNumber(results, item.path) ?? 0,
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
}

function sumValues(rows: CategoryRow[]): number {
  return rows.reduce((total, row) => total + row.value, 0);
}

function sideById(taxonomy: Record<string, unknown> | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const raw = taxonomy?.items;
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id === 'string' && typeof record.side === 'string') {
      map.set(record.id, record.side);
    }
  }
  return map;
}

/**
 * Perspective keys mostly match taxonomy categories. Three keys do not:
 * `avoided` is taxonomy category `avoided_emissions`, utility `revenue` is
 * the transfer item `capital_recovery`, and utility `delay` is `base_delay`.
 */
function itemsForCategory(
  items: TaxonomyItemView[],
  sides: Map<string, string>,
  side: LedgerSide,
  key: string,
): TaxonomyItemView[] {
  if (key === 'delay') return items.filter((item) => item.id === 'base_delay');
  if (key === 'revenue') return items.filter((item) => item.id === 'capital_recovery');
  const category = key === 'avoided' ? 'avoided_emissions' : key;
  return items
    .filter((item) => item.category === category && sides.get(item.id) === side)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function CategoryWaterfall({
  title,
  data,
  fill,
}: {
  title: string;
  data: CategoryRow[];
  fill: string;
}): ReactElement {
  if (data.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold">{title}</h2>
        <p className="text-sm text-slate-500">Every category is excluded from the chart.</p>
      </section>
    );
  }

  const height = Math.max(160, data.length * 48);
  return (
    <section className="min-w-0">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
        >
          <XAxis type="number" tickFormatter={formatAxisCurrency} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={156}
            interval={0}
            tick={{ fontSize: 12 }}
          />
          <Tooltip formatter={(value) => formatTooltipCurrency(value)} />
          <Bar dataKey="value" name="Present value" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

export function CategoryLedger({
  results,
  taxonomy,
  perspective,
  side,
}: CategoryLedgerProps): ReactElement {
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [scope, setScope] = useState(`${perspective}:${side}`);
  const nextScope = `${perspective}:${side}`;
  if (scope !== nextScope) {
    setScope(nextScope);
    setExcluded(new Set());
  }

  const definition = PERSPECTIVE_DEFINITIONS[perspective];
  const categories = PERSPECTIVE_CATEGORIES[perspective];
  const costRows = loadRows(results, categories.costs);
  const benefitRows = loadRows(results, categories.benefits);
  const rows = side === 'cost' ? costRows : benefitRows;
  const totals = {
    costs: readNumber(results, TOTAL_PATHS[perspective].costs) ?? sumValues(costRows),
    benefits: readNumber(results, TOTAL_PATHS[perspective].benefits) ?? sumValues(benefitRows),
  };
  const excludedRows = rows.filter((row) => excluded.has(row.key));
  const excludedPV = sumValues(excludedRows);
  const adjustedCosts = side === 'cost' ? totals.costs - excludedPV : totals.costs;
  const adjustedBenefits = side === 'benefit' ? totals.benefits - excludedPV : totals.benefits;
  const adjustedBcr =
    adjustedCosts > 0 && Number.isFinite(adjustedBenefits)
      ? adjustedBenefits / adjustedCosts
      : null;
  const grandTotal = side === 'cost' ? totals.costs : totals.benefits;
  const chartRows = rows.filter((row) => !excluded.has(row.key));
  const resultById = resolveResultById(results);
  const taxonomyItems = readTaxonomyItems(taxonomy);
  const sides = sideById(taxonomy);
  const noun = side === 'cost' ? 'costs' : 'benefits';
  const exclusionNote =
    excludedRows.length === 0
      ? 'No categories excluded.'
      : `Excluding ${joinLabels(excludedRows.map((row) => row.label))} from ${noun}.`;

  function toggleExcluded(key: string, include: boolean): void {
    setExcluded((current) => {
      const next = new Set(current);
      if (include) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOpen(key: string): void {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {definition.label} adjusted BCR
          </p>
          <p className={cn('text-4xl font-bold tabular-nums', ratioClass(adjustedBcr))}>
            {formatNumber(adjustedBcr, 3)}
          </p>
          <p className="mt-1 text-sm text-slate-500">{exclusionNote}</p>
        </CardContent>
      </Card>

      <CategoryWaterfall
        title={side === 'cost' ? 'Costs' : 'Benefits'}
        data={chartRows}
        fill={side === 'cost' ? COST_BAR : BENEFIT_BAR}
      />

      <div className="space-y-3">
        {rows.map((row) => {
          const isExcluded = excluded.has(row.key);
          const isOpen = open.has(row.key);
          const share = grandTotal !== 0 ? (row.value / grandTotal) * 100 : 0;
          const matched = itemsForCategory(taxonomyItems, sides, side, row.key);
          const cards = positiveItems(matched, resultById, true);
          return (
            <section
              key={row.key}
              className={cn(
                'rounded-lg border border-slate-200',
                isExcluded && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-3 px-3 py-3">
                <Checkbox
                  checked={!isExcluded}
                  aria-label={`Include ${row.label} in the BCR`}
                  onCheckedChange={(checked) => {
                    toggleExcluded(row.key, checked);
                  }}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={isOpen}
                  onClick={() => {
                    toggleOpen(row.key);
                  }}
                >
                  <ChevronRight
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-90 text-primary',
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-sm font-semibold',
                      isExcluded && 'line-through',
                    )}
                  >
                    {row.label}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(row.value, 0)}
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {formatNumber(share, 1)}%
                  </span>
                </button>
              </div>
              {isOpen ? (
                <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                  {cards.length > 0 ? (
                    cards.map((item, index) => {
                      const values = cardValues(resultById, item.id);
                      return (
                        <TaxonomyCard
                          key={item.id}
                          label={item.label}
                          annualValue={values.annualValue}
                          nominalValue={values.nominalValue}
                          pvValue={values.pvValue}
                          detailRows={values.detailRows}
                          colorIndex={index}
                          parentTotal={row.value}
                        />
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">No line items in this category.</p>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
