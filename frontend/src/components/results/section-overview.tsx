import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CompositionBar } from '@/components/results/composition-bar';
import {
  compositionSegments,
  itemPresentValue,
  itemsInCategory,
  readTaxonomyItems,
  resolveResultById,
  sumPresentValue,
} from '@/components/results/taxonomy-view';
import { formatCurrency, formatNumber } from '@/lib/format';
import { CATEGORY_LABELS, COST_CATEGORY_ORDER } from '@/lib/results-utils';
import { cn } from '@/lib/utils';

export interface SectionOverviewProps {
  results: Record<string, unknown>;
  sectionType: 'costs' | 'benefits';
  taxonomy?: Record<string, unknown>;
  onNavigate?: (subItemId: string) => void;
}

const BENEFIT_CATEGORIES = ['remedial', 'enabling', 'avoided_emissions'] as const;

/** Sub-item ids from `getSubItemIdForCategory` in results-renderer.js. */
const SUB_ITEM_FOR_CATEGORY: Record<string, string> = {
  hard: 'r-capital',
  soft: 'r-operational',
  risk: 'r-risk-costs',
  emissions: 'r-emissions-costs',
  remedial: 'r-remedial',
  enabling: 'r-loss-comp',
  avoided_emissions: 'r-emissions-costs',
};

function moneyTone(value: number): string | undefined {
  return value < 0 ? 'text-red-600' : undefined;
}

export function SectionOverview({
  results,
  sectionType,
  taxonomy,
  onNavigate,
}: SectionOverviewProps): ReactElement {
  if (!taxonomy) return <div />;

  const categories = sectionType === 'costs' ? COST_CATEGORY_ORDER : [...BENEFIT_CATEGORIES];
  const resultById = resolveResultById(results);
  const items = readTaxonomyItems(taxonomy);
  const grouped = categories.map((category) => itemsInCategory(items, category));
  const parentTotal = grouped.reduce(
    (sum, categoryItems) => sum + sumPresentValue(categoryItems, resultById),
    0,
  );
  const heading = sectionType === 'costs' ? 'Total Costs (PV)' : 'Total Benefits (PV)';

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{heading}</h2>
        <p className={cn('text-xl font-bold tabular-nums', moneyTone(parentTotal))}>
          {formatCurrency(parentTotal, 0)}
        </p>
      </div>
      {categories.map((category) => {
        const categoryItems = itemsInCategory(items, category);
        const categoryPv = categoryItems.reduce(
          (sum, item) => sum + itemPresentValue(resultById, item.id),
          0,
        );
        if (categoryPv <= 0) return null;
        const label = CATEGORY_LABELS[category] ?? category;
        const pct = parentTotal > 0 ? (categoryPv / parentTotal) * 100 : 0;
        const segments = compositionSegments(categoryItems, resultById, true);
        const subItemId = SUB_ITEM_FOR_CATEGORY[category] ?? 'r-capital';
        return (
          <Card key={category}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className={cn('text-xl tabular-nums', moneyTone(categoryPv))}>
                {formatCurrency(categoryPv, 0)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {formatNumber(pct, 0)}% of total {sectionType}
              </p>
              {segments.length > 0 ? <CompositionBar segments={segments} /> : null}
              {onNavigate ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  aria-label={`View ${label} details`}
                  onClick={() => {
                    onNavigate(subItemId);
                  }}
                >
                  View details
                </Button>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
