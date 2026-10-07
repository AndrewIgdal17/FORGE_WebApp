import type { ReactElement } from 'react';
import { BenefitDrillIn } from '@/components/results/benefit-drill-in';
import { CostDrillIn } from '@/components/results/cost-drill-in';
import { ResultsBCRPanel } from '@/components/results/results-bcr-panel';
import { ResultsOverview } from '@/components/results/results-overview';
import { SectionOverview } from '@/components/results/section-overview';

export interface ResultsDispatcherProps {
  subItemId: string;
  results: Record<string, unknown> | null;
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
  taxonomy,
  onNavigate,
}: ResultsDispatcherProps): ReactElement | null {
  if (!results) return <NoResultsPlaceholder />;

  switch (subItemId) {
    case 'r-overview':
      return <ResultsOverview results={results} taxonomy={taxonomy} />;
    case 'r-bcr':
      return <ResultsBCRPanel results={results} taxonomy={taxonomy} />;
    case 'r-costs-overview':
      return (
        <SectionOverview
          results={results}
          sectionType="costs"
          taxonomy={taxonomy}
          onNavigate={onNavigate}
        />
      );
    case 'r-capital':
      return <CostDrillIn results={results} categories={['hard']} taxonomy={taxonomy} />;
    case 'r-operational':
      return <CostDrillIn results={results} categories={['soft']} taxonomy={taxonomy} />;
    case 'r-risk-costs':
      return <CostDrillIn results={results} categories={['risk']} taxonomy={taxonomy} />;
    case 'r-emissions-costs':
      return <CostDrillIn results={results} categories={['emissions']} taxonomy={taxonomy} />;
    case 'r-benefits-overview':
      return (
        <SectionOverview
          results={results}
          sectionType="benefits"
          taxonomy={taxonomy}
          onNavigate={onNavigate}
        />
      );
    case 'r-congestion':
      return (
        <BenefitDrillIn
          results={results}
          category="remedial"
          subgroup="congestion"
          taxonomy={taxonomy}
        />
      );
    case 'r-loss-comp':
      return <BenefitDrillIn results={results} category="enabling" taxonomy={taxonomy} />;
    case 'r-remedial':
      return <BenefitDrillIn results={results} category="remedial" taxonomy={taxonomy} />;
    default:
      return null;
  }
}
