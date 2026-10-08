import type { ReactElement } from 'react';
import { CategoryLedger } from '@/components/results/category-ledger';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';

export interface CostsViewProps {
  results: Record<string, unknown>;
  taxonomy?: Record<string, unknown>;
  perspective: PerspectiveKey;
}

export function CostsView({
  results,
  taxonomy,
  perspective,
}: CostsViewProps): ReactElement {
  return (
    <CategoryLedger
      results={results}
      taxonomy={taxonomy}
      perspective={perspective}
      side="cost"
    />
  );
}
