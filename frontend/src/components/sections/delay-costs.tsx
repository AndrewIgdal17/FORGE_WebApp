import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';

export function DelayCosts(): ReactElement {
  return (
    <section id="delay-costs" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Delay costs</h2>
        <p className="text-sm text-slate-600">
          Direct spending during the pre-construction delay. Foregone congestion benefits are calculated separately.
        </p>
      </div>
      <CurrencyField
        path="05_delays.annual_base_delay_cost"
        label="Annual base delay cost ($/year)"
        helpText="Legal, administrative, project-management, and regulatory spend during permitting delay."
      />
    </section>
  );
}
