import type { ReactElement } from 'react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CompositionBar } from '@/components/results/composition-bar';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  CATEGORY_LABELS,
  COST_CATEGORY_ORDER,
  buildResultById,
} from '@/lib/results-utils';
import { cn } from '@/lib/utils';

export interface ResultsOverviewProps {
  results: Record<string, unknown>;
  taxonomy?: Record<string, unknown>;
}

const BENEFIT_CATEGORIES = ['remedial', 'enabling', 'avoided_emissions'] as const;

const BCR_HEADLINE = [
  { key: 'bcr_societal', label: 'Societal BCR' },
  { key: 'bcr_ratepayer', label: 'Ratepayer BCR' },
  { key: 'bcr_utility', label: 'Utility BCR' },
] as const;

const SUMMARY_KEYS: Record<string, string> = {
  hard: 'reporting_category_hard_pv',
  soft: 'reporting_category_soft_pv',
  risk: 'reporting_category_risk_pv',
  emissions: 'reporting_category_emissions_pv',
  remedial: 'benefits_remedial_pv',
  enabling: 'benefits_enabling_pv',
  avoided_emissions: 'displacement_avoided_benefit_pv',
};

const BCR_TOTAL_KEYS: Record<string, string> = {
  hard: 'hard_costs_pv',
  soft: 'soft_costs_pv',
  risk: 'risk_costs_pv',
  emissions: 'emissions_costs_pv',
  remedial: 'benefits_remedial_pv',
  enabling: 'benefits_enabling_pv',
  avoided_emissions: 'benefits_avoided_emissions_pv',
};

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

function categoryTotalFromTaxonomy(
  taxonomy: Record<string, unknown> | undefined,
  resultById: Record<string, unknown>,
  category: string,
): number | null {
  const items = taxonomy?.items;
  if (!Array.isArray(items)) return null;
  let sum = 0;
  let found = false;
  for (const item of items) {
    const record = asRecord(item);
    if (!record || record.category !== category || typeof record.id !== 'string') continue;
    found = true;
    const row = asRecord(resultById[record.id]);
    sum += readFinite(row, 'value_pv') ?? 0;
  }
  return found ? sum : null;
}

function categoryTotal(
  summary: Record<string, unknown> | null,
  bcr: Record<string, unknown> | null,
  taxonomy: Record<string, unknown> | undefined,
  resultById: Record<string, unknown>,
  category: string,
): number {
  const summaryKey = SUMMARY_KEYS[category];
  const fromSummary = summaryKey ? readFinite(summary, summaryKey) : null;
  if (fromSummary != null) return fromSummary;
  const bcrKey = BCR_TOTAL_KEYS[category];
  const fromBcr = bcrKey ? readFinite(bcr, bcrKey) : null;
  if (fromBcr != null) return fromBcr;
  return categoryTotalFromTaxonomy(taxonomy, resultById, category) ?? 0;
}

function bcrTone(value: number | null): string | undefined {
  if (value == null) return undefined;
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

function moneyTone(value: number): string | undefined {
  return value < 0 ? 'text-red-600' : undefined;
}

function SectionHeading({ title }: { title: string }): ReactElement {
  return <h2 className="mb-3 text-sm font-semibold">{title}</h2>;
}

function MoneyCard({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn('text-xl tabular-nums', moneyTone(value))}>
          {formatCurrency(value, 0)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

export function ResultsOverview({
  results,
  taxonomy,
}: ResultsOverviewProps): ReactElement {
  const summary = asRecord(results.summary);
  const bcr = asRecord(results.bcr);
  const resultById = buildResultById(results);

  const totalCosts =
    readFinite(summary, 'total_costs_pv') ?? readFinite(bcr, 'total_costs_pv') ?? 0;
  const totalBenefits =
    readFinite(summary, 'total_benefits_pv') ?? readFinite(bcr, 'total_benefits_pv') ?? 0;

  const costCards = COST_CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    value: categoryTotal(summary, bcr, taxonomy, resultById, category),
  }));
  const benefitCards = BENEFIT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    value: categoryTotal(summary, bcr, taxonomy, resultById, category),
  }));

  return (
    <div className="space-y-8">
      <section>
        <SectionHeading title="Cost vs Benefit" />
        <CompositionBar
          segments={[
            { label: 'Costs', value: totalCosts, color: '#0066cc' },
            { label: 'Benefits', value: totalBenefits, color: '#0f766e' },
          ]}
        />
      </section>

      <section>
        <SectionHeading title="Costs" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {costCards.map((card) => (
            <MoneyCard key={card.category} label={card.label} value={card.value} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="Benefits" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {benefitCards.map((card) => (
            <MoneyCard key={card.category} label={card.label} value={card.value} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="Benefit-Cost Ratios" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {BCR_HEADLINE.map((metric) => {
            const value = readFinite(bcr, metric.key);
            const bg =
              value == null
                ? ''
                : value >= 1
                  ? 'bg-green-50 ring-1 ring-green-200/60'
                  : 'bg-red-50 ring-1 ring-red-200/60';
            return (
              <Card key={metric.key} className={bg}>
                <CardHeader>
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {metric.label}
                  </CardDescription>
                  <CardTitle className={cn('text-3xl font-bold tabular-nums', bcrTone(value))}>
                    {formatNumber(value, 3)}
                  </CardTitle>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
