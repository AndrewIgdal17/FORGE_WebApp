import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const PROJECT_TYPE_PATH = '01_project_technical_details.project.project_type';
const SECTION = '17_congestion_reductions';

export function SystemConstraints(): ReactElement {
  const projectType = useFormStore((state) => state.getFieldValue(PROJECT_TYPE_PATH));
  const incremental =
    projectType === 'reconductoring' || projectType === 'rebuild';
  const root = incremental
    ? 'incremental_congestion_reductions'
    : 'greenfield_congestion_reductions';
  const base = `${SECTION}.${root}`;

  return (
    <section id="system-constraints" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">System constraints</h2>
        <p className="text-sm text-slate-600">
          {incremental
            ? 'Incremental congestion relief on the existing corridor.'
            : 'Greenfield congestion relief for a new line.'}
        </p>
      </div>
      {incremental ? null : (
        <PercentageField
          path={`${base}.constraints.flow_factor`}
          label="Flow factor (%)"
          helpText="Deliverability to the targeted constraint, from 0 to 100 percent."
        />
      )}
      <NumberField
        path={`${base}.constraints.constrained_hours`}
        label="Constrained hours (hours/year)"
        helpText="Hours per year the targeted constraint binds."
        min={0}
      />
      <NumberField
        path={`${base}.constraints.average_exceedance`}
        label="Average exceedance (MW)"
        helpText="Average megawatts of exceedance during constrained hours."
        min={0}
      />
      <CurrencyField
        path={`${base}.prices.average_congestion_price`}
        label="Congestion price ($/MWh)"
        helpText="Marginal redispatch cost during congestion hours."
      />
    </section>
  );
}
