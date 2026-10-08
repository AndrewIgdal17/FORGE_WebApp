import type { ReactElement } from 'react';
import { BenefitsView } from '@/components/results/benefits-view';
import { CostsView } from '@/components/results/costs-view';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { ResultsOverview } from '@/components/results/results-overview';

export interface ResultsDispatcherProps {
  subItemId: string;
  results: Record<string, unknown> | null;
  perspective: PerspectiveKey;
  taxonomy?: Record<string, unknown>;
  isReconductoring?: boolean;
  acDc?: string;
  constructionType?: string;
  onNavigate?: (subItemId: string) => void;
}

export function NoResultsPlaceholder(): ReactElement {
  return (
    <div className="flex min-h-[300px] items-center justify-center px-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">
        Run a calculation to see results. Fill in the required fields and click Calculate.
      </p>
    </div>
  );
}

/**
 * Maps a results sidebar sub-item to its view.
 * Overview, costs, and benefits are live. Timeline and sensitivity arrive in later tasks.
 */
export function ResultsDispatcher({
  subItemId,
  results,
  perspective,
  taxonomy,
}: ResultsDispatcherProps): ReactElement | null {
  if (!results) return <NoResultsPlaceholder />;

  switch (subItemId) {
    case 'r-overview':
      return <ResultsOverview results={results} taxonomy={taxonomy} perspective={perspective} />;
    case 'r-costs':
      return <CostsView results={results} taxonomy={taxonomy} perspective={perspective} />;
    case 'r-benefits':
      return <BenefitsView results={results} taxonomy={taxonomy} perspective={perspective} />;
    case 'r-timeline':
    case 'r-sensitivity':
      return <div className="p-6 text-sm text-slate-500">Coming in Tasks 5–6.</div>;
    default:
      return null;
  }
}
