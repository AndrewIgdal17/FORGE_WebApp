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
      { key: 'soft', label: 'Soft Costs', path: 'summary.reporting_category_soft_pv' },
      { key: 'hard', label: 'Hard Costs', path: 'summary.reporting_category_hard_pv' },
      { key: 'emissions', label: 'Loss Compensation', path: 'summary.reporting_category_emissions_pv' },
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

const SPECIFIC_TOTAL_PATHS: Record<
  Exclude<PerspectiveKey, 'societal'>,
  { costs: string; benefits: string }
> = {
  ratepayer: {
    costs: 'bcr.ratepayer_costs_pv',
    benefits: 'bcr.ratepayer_benefits_pv',
  },
  utility: {
    costs: 'bcr.utility_costs_pv',
    benefits: 'bcr.utility_benefits_pv',
  },
};

const COST_BAR = '#dc2626';
const BENEFIT_BAR = '#059669';

interface CategoryAmount {
  key: string;
  label: string;
  value: number;
}

interface MoneyTotals {
  costs: number;
  benefits: number;
}

function readNumber(results: Record<string, unknown>, path: string): number | null {
  const value = getValueAtPath(results, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function readText(results: Record<string, unknown>, path: string): string | null {
  const value = getValueAtPath(results, path);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatCompactCurrency(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${formatCurrency(abs, 0)}`;
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

function sumValues(items: CategoryAmount[]): number {
  return items.reduce((total, item) => total + item.value, 0);
}

/** Recover cost and benefit totals from BCR = B/C and net = B−C when the payload has no split. */
function impliedTotals(bcr: number, netBenefit: number): MoneyTotals | null {
  if (Math.abs(bcr - 1) < 1e-6) return null;
  const costs = netBenefit / (bcr - 1);
  const benefits = costs * bcr;
  if (!Number.isFinite(costs) || !Number.isFinite(benefits) || costs < 0 || benefits < 0) {
    return null;
  }
  return { costs, benefits };
}

function resolveTotals(
  perspective: PerspectiveKey,
  results: Record<string, unknown>,
  costs: CategoryAmount[],
  benefits: CategoryAmount[],
  bcr: number | null,
  netBenefit: number | null,
): MoneyTotals {
  const summed: MoneyTotals = {
    costs: sumValues(costs),
    benefits: sumValues(benefits),
  };

  if (perspective === 'societal') {
    const totalCosts = readNumber(results, 'summary.total_costs_pv');
    const totalBenefits = readNumber(results, 'summary.total_benefits_pv');
    if (totalCosts != null && totalBenefits != null) {
      return { costs: totalCosts, benefits: totalBenefits };
    }
    return summed;
  }

  const paths = SPECIFIC_TOTAL_PATHS[perspective];
  const specificCosts = readNumber(results, paths.costs);
  const specificBenefits = readNumber(results, paths.benefits);
  if (specificCosts != null && specificBenefits != null) {
    return { costs: specificCosts, benefits: specificBenefits };
  }

  if (bcr != null && netBenefit != null) {
    const implied = impliedTotals(bcr, netBenefit);
    if (implied) return implied;
  }
  return summed;
}

function generateNarrative(
  perspective: PerspectiveKey,
  totalCosts: number,
  totalBenefits: number,
  bcr: number | null,
  costCategories: CategoryAmount[],
): string {
  const label = PERSPECTIVE_DEFINITIONS[perspective].label.toLowerCase();
  const bcrText = bcr == null ? 'n/a' : bcr.toFixed(2);
  const largest = costCategories[0];
  const displayedCosts = sumValues(costCategories);
  const driver =
    largest && displayedCosts !== 0
      ? ` The primary cost driver is ${largest.label} (${formatCompactCurrency(largest.value)}, ${Math.round((Math.abs(largest.value) / Math.abs(displayedCosts)) * 100)}%).`
      : '';
  const pencil =
    bcr == null
      ? ''
      : ` The project ${bcr >= 1 ? 'pencils' : 'does not pencil'} under the ${label} perspective.`;

  if (perspective === 'ratepayer') {
    return `Ratepayers see ${formatCompactCurrency(totalBenefits)} in benefits against ${formatCompactCurrency(totalCosts)} in costs, for a BCR of ${bcrText}.${driver} Avoided emissions do not flow through rates.${pencil}`;
  }
  if (perspective === 'utility') {
    return `The utility earns ${formatCompactCurrency(totalBenefits)} in allowed revenue against ${formatCompactCurrency(totalCosts)} in costs, for a BCR of ${bcrText}.${driver}${pencil}`;
  }
  return `This project costs ${formatCompactCurrency(totalCosts)} and delivers ${formatCompactCurrency(totalBenefits)} in ${label} benefits, for a BCR of ${bcrText}.${driver}${pencil}`;
}

function formatProjectContext(results: Record<string, unknown>): string {
  const miles = readNumber(results, 'technical_parameters.line_length_miles');
  const capacity = readNumber(results, 'technical_parameters.capacity_mw');
  const acDc = readText(results, 'technical_parameters.ac_dc');
  const delay = readNumber(results, 'technical_parameters.delay_years');
  const lifetime = readNumber(results, 'technical_parameters.project_lifetime_years');
  const milesText = miles == null ? '— mi' : `${formatNumber(miles, 0)} mi`;
  const capacityText =
    capacity == null
      ? `— MW${acDc ? ` ${acDc}` : ''}`
      : `${formatNumber(capacity, 0)} MW${acDc ? ` ${acDc}` : ''}`;
  const delayText = delay == null ? '— yr delay' : `${formatNumber(delay, 0)} yr delay`;
  const lifeText = lifetime == null ? '— yr life' : `${formatNumber(lifetime, 0)} yr life`;
  return `${milesText} · ${capacityText} · ${delayText} · ${lifeText}`;
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
  const totals = resolveTotals(perspective, results, costs, benefits, bcr, netBenefit);
  const narrative = generateNarrative(
    perspective,
    totals.costs,
    totals.benefits,
    bcr,
    costs,
  );

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

      <p className="text-sm leading-relaxed text-slate-600">{narrative}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryWaterfall title="Costs" data={costs} fill={COST_BAR} />
        <CategoryWaterfall title="Benefits" data={benefits} fill={BENEFIT_BAR} />
      </div>

      <p className="border-t border-slate-200 pt-4 text-sm text-slate-500">
        {formatProjectContext(results)}
      </p>
    </div>
  );
}
