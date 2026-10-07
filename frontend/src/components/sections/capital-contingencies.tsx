import type { ReactElement } from 'react';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const CONTINGENCIES = '03_financing.financial.contingencies';
const AC_DC_PATH = '01_project_technical_details.project.ac_dc';

export function CapitalContingencies(): ReactElement {
  const acDc = useFormStore((state) => state.getFieldValue(AC_DC_PATH));
  const isDc = acDc === 'DC';

  return (
    <section id="conductor" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Capital contingencies</h2>
        <p className="text-sm text-slate-600">
          Percentage markup applied to conductor, structure, and converter build costs.
        </p>
      </div>
      <PercentageField
        path={`${CONTINGENCIES}.conductor_contingency`}
        label="Conductor contingency (%)"
        helpText="Markup on conductor cost for contingencies."
      />
      <PercentageField
        path={`${CONTINGENCIES}.structure_contingency`}
        label="Structure contingency (%)"
        helpText="Markup on structure cost for contingencies."
      />
      {isDc ? (
        <PercentageField
          path={`${CONTINGENCIES}.converter_contingency`}
          label="Converter contingency (%)"
          helpText="Markup on converter station cost. Applies to DC projects."
        />
      ) : (
        <p className="text-sm text-slate-600">Converter contingency applies to DC projects.</p>
      )}
    </section>
  );
}
