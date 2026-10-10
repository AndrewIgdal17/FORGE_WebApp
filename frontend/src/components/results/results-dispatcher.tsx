import type { ReactElement } from 'react';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { ResultsOverview } from '@/components/results/results-overview';
import { TimelineChart } from '@/components/results/timeline-chart';

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
 * Overview and timeline are live.
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
    case 'r-timeline':
      return <TimelineChart results={results} perspective={perspective} />;
    default:
      return null;
  }
}
