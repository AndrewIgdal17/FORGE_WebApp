import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const CONTINGENCIES = '03_financing.financial.contingencies';
const BUILD_COSTS = '10_project_category_build_costs';
const OVERRIDES = `${BUILD_COSTS}.overrides`;
const AC_DC_PATH = '01_project_technical_details.project.ac_dc';
const OVERRIDE_HELP =
  'Blank uses the equipment catalog. A number replaces the catalog value.';

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
      <PercentageField
        path={`${BUILD_COSTS}.soft_cost_multiplier`}
        label="Soft cost adder (%)"
        helpText="Project management, engineering, and administrative costs, applied after contingency. Default 10%."
      />
      <div className="grid gap-4 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Build cost overrides</h3>
        <CurrencyField
          path={`${OVERRIDES}.variable_conductor_cost_per_mile`}
          label="Conductor cost ($/mile)"
          helpText={OVERRIDE_HELP}
          nullable
        />
        <CurrencyField
          path={`${OVERRIDES}.fixed_conductor_cost`}
          label="Conductor fixed cost ($)"
          helpText={OVERRIDE_HELP}
          nullable
        />
        <CurrencyField
          path={`${OVERRIDES}.variable_structure_cost_per_mile`}
          label="Structure cost ($/mile)"
          helpText={OVERRIDE_HELP}
          nullable
        />
        {isDc ? (
          <CurrencyField
            path={`${OVERRIDES}.fixed_converter_cost`}
            label="Converter cost, one end ($)"
            helpText={OVERRIDE_HELP}
            nullable
          />
        ) : null}
      </div>
    </section>
  );
}
