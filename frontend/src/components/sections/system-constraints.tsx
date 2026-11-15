import type { ReactElement } from 'react';
import { CheckboxField } from '@/components/form/checkbox-field';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const PROJECT_TYPE_PATH = '01_project_technical_details.project.project_type';
const SENDING_SOURCE_PATH = '01_project_technical_details.project.sending_source';
const SECTION = '17_congestion_reductions';
const CAPACITY = '20_capacity_value';

export const CAPACITY_GATE_HELP =
  'Capacity value does not apply unless this is on. With it on, a credit or price of 0 gives a measured $0.';

export function SystemConstraints(): ReactElement {
  const projectType = useFormStore((state) => state.getFieldValue(PROJECT_TYPE_PATH));
  const sendingSource = useFormStore((state) => state.getFieldValue(SENDING_SOURCE_PATH));
  const incremental =
    projectType === 'reconductoring' || projectType === 'rebuild';
  const root = incremental
    ? 'incremental_congestion_reductions'
    : 'greenfield_congestion_reductions';
  const base = `${SECTION}.${root}`;
  const showFlow = !incremental && sendingSource !== 'dedicated';

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
      {showFlow ? (
        <PercentageField
          path={`${base}.constraints.flow_factor`}
          label="Flow share (%)"
          helpText="Share of nameplate rating delivered to the constraint, from 0 to 100 percent."
        />
      ) : null}
      <NumberField
        path={`${base}.constraints.average_exceedance`}
        label="Average exceedance (MW)"
        helpText="Empty means the relief equals the effective capacity."
        min={0}
        nullable
      />
      <div className="grid gap-4 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Capacity Value</h3>
        <CheckboxField
          path={`${CAPACITY}.applicability_gate`}
          label="Receiving region is capacity-short"
          helpText={CAPACITY_GATE_HELP}
        />
        <PercentageField
          path={`${CAPACITY}.capacity_credit`}
          label="Capacity credit (%)"
          helpText="ELCC share of effective transfer capacity. Default 0 (off)."
        />
        <CurrencyField
          path={`${CAPACITY}.capacity_price`}
          label="Capacity price ($/MW-year)"
          helpText="Net CONE or clearing price. Default 0."
        />
      </div>
    </section>
  );
}
