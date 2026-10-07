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
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface BenefitDrillInProps {
  results: Record<string, unknown>;
  category: string;
  subgroup?: string;
  taxonomy?: Record<string, unknown>;
}

function moneyTone(value: number): string | undefined {
  return value < 0 ? 'text-red-600' : undefined;
}

/**
 * Expandable benefit cards for one taxonomy category.
 * Callers from `renderResultsSubItem`:
 * `r-congestion` → category `remedial`, subgroup `congestion`;
 * `r-loss-comp` → category `enabling`;
 * `r-remedial` → category `remedial`.
 */
export function BenefitDrillIn({
  results,
  category,
  subgroup,
  taxonomy,
}: BenefitDrillInProps): ReactElement {
  if (!taxonomy) return <div />;

  const resultById = resolveResultById(results);
  const matched = itemsInCategory(readTaxonomyItems(taxonomy), category).filter((item) => {
    if (!subgroup) return true;
    return item.subgroup === subgroup;
  });
  const categoryTotal = sumPresentValue(matched, resultById);
  const segments = compositionSegments(matched, resultById, false);
  const cards = positiveItems(matched, resultById, false);
  const headingKey = subgroup || category;

  return (
    <div>
      <h2 className="text-sm font-semibold">{pvHeading(headingKey, 'Benefits')}</h2>
      <p className={cn('text-2xl font-bold tabular-nums', moneyTone(categoryTotal))}>
        {formatCurrency(categoryTotal, 0)}
      </p>
      {segments.length > 1 ? (
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
    </div>
  );
}
