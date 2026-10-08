import type { ReactElement } from 'react';
import { CustomBCRPanel } from '@/components/results/custom-bcr-panel';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { PerspectivesTable } from '@/components/results/perspectives-table';
import { SensitivityTable } from '@/components/results/sensitivity-table';

export interface ResultsBCRPanelProps {
  results: Record<string, unknown>;
  perspective: PerspectiveKey;
  taxonomy?: Record<string, unknown>;
}

export function ResultsBCRPanel({
  results,
  perspective: _perspective,
  taxonomy,
}: ResultsBCRPanelProps): ReactElement {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Perspectives</h2>
        <PerspectivesTable results={results} />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Custom Societal BCR</h2>
        <CustomBCRPanel results={results} taxonomy={taxonomy} />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Sensitivity</h2>
        <SensitivityTable results={results} />
      </section>
    </div>
  );
}
