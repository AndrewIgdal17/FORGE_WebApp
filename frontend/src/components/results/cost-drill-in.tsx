import type { ReactElement } from 'react';
import { CompositionBar } from '@/components/results/composition-bar';
import { TaxonomyCard } from '@/components/results/taxonomy-card';
import {
  cardValues,
  compositionSegments,
  itemsInCategory,
  positiveItems,
  pvHeading,
  readTaxonomyItems,
  resolveResultById,
  sumPresentValue,
} from '@/components/results/taxonomy-view';
import { formatCurrency, formatNumber } from '@/lib/format';
import { COST_CATEGORY_ORDER } from '@/lib/results-utils';
import { cn } from '@/lib/utils';

export interface CostDrillInProps {
  results: Record<string, unknown>;
  categories: string[];
  taxonomy?: Record<string, unknown>;
}

function moneyTone(value: number): string | undefined {
  return value < 0 ? 'text-red-600' : undefined;
}

/**
 * Expandable cost cards grouped by taxonomy category.
 * Callers pass taxonomy category keys from `renderResultsSubItem`:
 * `r-capital` → `['hard']`, `r-operational` → `['soft']`,
 * `r-risk-costs` → `['risk']`, `r-emissions-costs` → `['emissions']`.
 */
export function CostDrillIn({
  results,
  categories,
  taxonomy,
}: CostDrillInProps): ReactElement {
  if (!taxonomy) return <div />;

  const resultById = resolveResultById(results);
  const items = readTaxonomyItems(taxonomy);
  const projectItems = COST_CATEGORY_ORDER.flatMap((category) => itemsInCategory(items, category));
  const projectTotal = sumPresentValue(projectItems, resultById);

  return (
    <div className="space-y-8">
      {categories.map((category) => {
        const categoryItems = itemsInCategory(items, category);
        const categoryTotal = sumPresentValue(categoryItems, resultById);
        const pct = projectTotal > 0 ? (categoryTotal / projectTotal) * 100 : 0;
        const segments = compositionSegments(categoryItems, resultById, true);
        const cards = positiveItems(categoryItems, resultById, true);
        return (
          <section key={category}>
            <h2 className="text-sm font-semibold">{pvHeading(category, 'Costs')}</h2>
            <p className={cn('text-2xl font-bold tabular-nums', moneyTone(categoryTotal))}>
              {formatCurrency(categoryTotal, 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatNumber(pct, 0)}% of total project costs
            </p>
            {segments.length > 0 ? (
              <div className="mt-3">
                <CompositionBar segments={segments} />
              </div>
            ) : null}
            {cards.length > 0 ? (
              <div className="mt-5 space-y-2">
                {cards.map((item, index) => {
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
                      parentTotal={categoryTotal}
                    />
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
