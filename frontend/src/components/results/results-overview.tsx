import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import {
  PERSPECTIVE_DEFINITIONS,
  type PerspectiveKey,
} from '@/components/results/perspective-toggle';
import { formatCurrency, formatNumber } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';

export interface ResultsOverviewProps {
  results: Record<string, unknown>;
  perspective: PerspectiveKey;
  taxonomy?: Record<string, unknown>;
}

export interface PerspectiveCategoryItem {
  key: string;
  label: string;
  path: string;
}

export const PERSPECTIVE_CATEGORIES: Record<
  PerspectiveKey,
  {
    costs: PerspectiveCategoryItem[];
    benefits: PerspectiveCategoryItem[];
  }
> = {
  societal: {
    costs: [
      { key: 'risk', label: 'Risk Costs', path: 'summary.reporting_category_risk_pv' },
      { key: 'soft', label: 'Soft Costs', path: 'summary.reporting_category_soft_pv' },
      { key: 'emissions', label: 'Emissions', path: 'summary.reporting_category_emissions_pv' },
      { key: 'hard', label: 'Hard Costs', path: 'summary.reporting_category_hard_pv' },
    ],
    benefits: [
      { key: 'avoided', label: 'Avoided Emissions', path: 'bcr.displacement_avoided_benefit_pv' },
      { key: 'enabling', label: 'Enabling', path: 'bcr.benefits_enabling_pv' },
      { key: 'remedial', label: 'Remedial', path: 'bcr.benefits_remedial_pv' },
    ],
  },
  ratepayer: {
    costs: [
      { key: 'capital_recovery', label: 'Capital Recovery', path: 'bcr.capital_recovery_pv' },
      { key: 'oandm', label: 'O&M', path: 'bcr.oandm_pv' },
      { key: 'insurance', label: 'Insurance', path: 'bcr.insurance_pv' },
      { key: 'row_rent', label: 'ROW Rent', path: 'bcr.row_rent_pv' },
      { key: 'conductor_loss', label: 'Conductor Losses', path: 'bcr.conductor_loss_pv' },
      { key: 'converter_loss', label: 'Converter Losses', path: 'bcr.converter_loss_pv' },
    ],
    benefits: [
      { key: 'enabling', label: 'Enabling', path: 'bcr.benefits_enabling_pv' },
      { key: 'remedial', label: 'Remedial', path: 'bcr.benefits_remedial_pv' },
    ],
  },
  utility: {
    costs: [
      { key: 'revenue', label: 'Revenue Requirement', path: 'bcr.capital_recovery_pv' },
      { key: 'delay', label: 'Base Delay', path: 'bcr.delay_cost_pv' },
    ],
    benefits: [
      { key: 'revenue', label: 'Allowed Revenue', path: 'bcr.capital_recovery_pv' },
    ],
  },
};

const COST_BAR = '#dc2626';
const BENEFIT_BAR = '#059669';

interface CategoryAmount {
  key: string;
  label: string;
  value: number;
}

function readNumber(results: Record<string, unknown>, path: string): number | null {
  const value = getValueAtPath(results, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function formatNetBenefit(value: number | null): string {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${formatCurrency(abs, 0)}`;
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

function netClass(value: number | null): string {
  if (value == null) return 'text-slate-400';
  return value >= 0 ? 'text-green-600' : 'text-red-600';
}

function loadCategories(
  results: Record<string, unknown>,
  items: PerspectiveCategoryItem[],
): CategoryAmount[] {
  return items
    .map((item) => ({
      key: item.key,
      label: item.label,
      value: readNumber(results, item.path) ?? 0,
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
}

function CategoryWaterfall({
  title,
  data,
  fill,
}: {
  title: string;
  data: CategoryAmount[];
  fill: string;
}): ReactElement {
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
          <XAxis
            type="number"
            tickFormatter={formatAxisCurrency}
            tick={{ fontSize: 11 }}
          />
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

export function ResultsOverview({
  results,
  perspective,
}: ResultsOverviewProps): ReactElement {
  const definition = PERSPECTIVE_DEFINITIONS[perspective];
  const bcr = readNumber(results, definition.bcrPath);
  const netBenefit = readNumber(results, definition.netBenefitPath);
  const categories = PERSPECTIVE_CATEGORIES[perspective];
  const costs = loadCategories(results, categories.costs);
  const benefits = loadCategories(results, categories.benefits);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {definition.label} BCR
              </p>
              <p className={cn('text-4xl font-bold tabular-nums', ratioClass(bcr))}>
                {formatNumber(bcr, 3)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Net Benefit
              </p>
              <p className={cn('text-3xl font-bold tabular-nums', netClass(netBenefit))}>
                {formatNetBenefit(netBenefit)}
              </p>
            </div>
            <p className="max-w-md flex-1 text-sm italic text-slate-600">
              {definition.definition}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryWaterfall title="Costs" data={costs} fill={COST_BAR} />
        <CategoryWaterfall title="Benefits" data={benefits} fill={BENEFIT_BAR} />
      </div>
    </div>
  );
}
