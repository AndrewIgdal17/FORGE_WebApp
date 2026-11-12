import type { ReactElement } from 'react';
import { PercentageField } from '@/components/form/percentage-field';

const EMISSIONS = '16_emissions_reductions.emissions_reductions';
const COMPENSATION_PATH = `${EMISSIONS}.compensation_percent`;

export function EmissionsSection(): ReactElement {
  return (
    <section id="energy-emissions-emissions" className="grid max-w-4xl gap-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Emissions</h2>
        <p className="text-sm text-slate-600">
          Share of line losses replaced by additional generation.
        </p>
      </div>
      <div className="grid max-w-xl gap-2">
        <PercentageField
          path={COMPENSATION_PATH}
          label="Loss compensation (%)"
          helpText="Share of line losses replaced by additional generation. Default 100%."
        />
      </div>
    </section>
  );
}
