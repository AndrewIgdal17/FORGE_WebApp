import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { useFormStore } from '@/stores/form-store';

const DELAY_YEARS = '01_project_technical_details.timeline.delay_years';

const DIRECT_DELAY_HELP =
  'Direct spending each year of the delay: legal, administrative, project-management and regulatory. No default: enter 0 if there is none.';

export function directDelayCostLabel(delayYears: unknown): string {
  const base = 'Annual direct delay cost ($/year)';
  if (typeof delayYears === 'number' && delayYears > 0) {
    return `${base}, required`;
  }
  return base;
}

export function DelayCosts(): ReactElement {
  const delayYears = useFormStore((state) => state.getFieldValue(DELAY_YEARS));

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
        label={directDelayCostLabel(delayYears)}
        helpText={DIRECT_DELAY_HELP}
        nullable
      />
    </section>
  );
}