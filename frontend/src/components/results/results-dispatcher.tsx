import type { ReactElement } from 'react';
import { BenefitDrillIn } from '@/components/results/benefit-drill-in';
import { CostDrillIn } from '@/components/results/cost-drill-in';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { ResultsBCRPanel } from '@/components/results/results-bcr-panel';
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
 * Category keys match `CostDrillIn` / `BenefitDrillIn` and `renderResultsSubItem`:
 * capital → hard, operational → soft, risk → risk, emissions → emissions,
 * congestion → remedial/congestion, loss compensation → enabling, remedial → remedial.
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
    case 'r-bcr':
      return <ResultsBCRPanel results={results} taxonomy={taxonomy} perspective={perspective} />;
    case 'r-capital':
      return (
        <CostDrillIn
          results={results}
          categories={['hard']}
          taxonomy={taxonomy}
          perspective={perspective}
        />
      );
    case 'r-operational':
      return (
        <CostDrillIn
          results={results}
          categories={['soft']}
          taxonomy={taxonomy}
          perspective={perspective}
        />
      );
    case 'r-risk-costs':
      return (
        <CostDrillIn
          results={results}
          categories={['risk']}
          taxonomy={taxonomy}
          perspective={perspective}
        />
      );
    case 'r-emissions-costs':
      return (
        <CostDrillIn
          results={results}
          categories={['emissions']}
          taxonomy={taxonomy}
          perspective={perspective}
        />
      );
    case 'r-congestion':
      return (
        <BenefitDrillIn
          results={results}
          category="remedial"
          subgroup="congestion"
          taxonomy={taxonomy}
          perspective={perspective}
        />
      );
    case 'r-loss-comp':
      return (
        <BenefitDrillIn
          results={results}
          category="enabling"
          taxonomy={taxonomy}
          perspective={perspective}
        />
      );
    case 'r-remedial':
      return (
        <BenefitDrillIn
          results={results}
          category="remedial"
          taxonomy={taxonomy}
          perspective={perspective}
        />
      );
    default:
      return null;
  }
}
