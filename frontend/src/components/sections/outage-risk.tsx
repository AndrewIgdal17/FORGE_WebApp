import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const OUTAGE = '07_outage_costs.outage';
const AC_DC_PATH = '01_project_technical_details.project.ac_dc';
const CAPACITY_PATH = `${OUTAGE}.capacity_at_risk_factor`;
const LOAD_SHED_PATH = `${OUTAGE}.load_shed_fraction`;
const LOAD_SHED_HELP =
  'Share of lost megawatts priced at the value of lost load. The rest uses the redispatch cost. Auto is 5% for AC and 80% for DC.';

const DURATION_TYPES = [
  { key: 'overhead', label: 'Overhead' },
  { key: 'underground', label: 'Underground' },
] as const;

export function OutageRisk(): ReactElement {
  const acDc = useFormStore((state) => state.getFieldValue(AC_DC_PATH));
  const capacity = useFormStore((state) => state.getFieldValue(CAPACITY_PATH));
  const loadShed = useFormStore((state) => state.getFieldValue(LOAD_SHED_PATH));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const automatic = capacity === 'auto';
  const loadShedAutomatic = loadShed === 'auto';
  const autoLoadShed = acDc === 'DC' ? '80% for DC' : '5% for AC';

  return (
    <section id="outage-risk" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Outage risk</h2>
        <p className="text-sm text-slate-600">
          Expected outage cost from duration, frequency, and the share of capacity lost per event.
        </p>
      </div>
      {automatic ? (
        <p className="text-sm text-slate-600">
          Capacity at risk is automatic (derived from the conductor table). Enter a number from 0 to 1 to override.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <NumberField
              path={CAPACITY_PATH}
              label="Capacity at risk (fraction of nameplate)"
              helpText="Fraction of capacity lost per outage. 1 is a radial line."
              min={0}
              max={1}
              step={0.01}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setFieldValue(CAPACITY_PATH, 'auto')}>
            Use automatic
          </Button>
        </div>
      )}
      {automatic ? (
        <NumberField
          path={CAPACITY_PATH}
          label="Capacity at risk (fraction of nameplate)"
          helpText="Leave this blank to keep the automatic value, or enter a fraction from 0 to 1."
          min={0}
          max={1}
          step={0.01}
        />
      ) : null}
      {loadShedAutomatic ? (
        <p className="text-sm text-slate-600">
          Load-shed fraction is automatic ({autoLoadShed}). Enter a percent to override.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <PercentageField
              path={LOAD_SHED_PATH}
              label="Load-shed fraction (%)"
              helpText={LOAD_SHED_HELP}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setFieldValue(LOAD_SHED_PATH, 'auto')}>
            Use automatic
          </Button>
        </div>
      )}
      {loadShedAutomatic ? (
        <PercentageField
          path={LOAD_SHED_PATH}
          label="Load-shed fraction (%)"
          helpText={LOAD_SHED_HELP}
        />
      ) : null}
      <CurrencyField
        path={`${OUTAGE}.redispatch_cost_per_mwh`}
        label="Redispatch cost ($/MWh)"
        helpText="Congestion premium for rerouting power during an outage."
      />
      <PercentageField
        path={`${OUTAGE}.risk_growth_rate`}
        label="Risk growth rate (%)"
        helpText="Annual increase in outage rates. Zero holds rates constant over the project life."
      />
      <NumberField
        path={`${OUTAGE}.outage_duration`}
        label="Base outage duration (hours/event)"
        helpText="Effective duration equals this base times the construction-type multiplier."
        min={0}
        step={1}
      />
      <h3 className="text-sm font-semibold text-slate-900">Duration multipliers</h3>
      {DURATION_TYPES.map((construction) => (
        <NumberField
          key={construction.key}
          path={`${OUTAGE}.outage_duration_multiplier.${construction.key}`}
          label={`${construction.label} duration multiplier`}
          helpText={`Multiplier on base outage duration for ${construction.label.toLowerCase()} construction.`}
          min={0}
        />
      ))}
      <h3 className="text-sm font-semibold text-slate-900">Outage frequency</h3>
      <NumberField
        path={`${OUTAGE}.outage_rate.overhead.lambda_terminal`}
        label="Overhead terminal rate (outages/year)"
        helpText="Length-independent terminal and substation outages for overhead lines."
        min={0}
        step={0.0001}
      />
      <NumberField
        path={`${OUTAGE}.outage_rate.overhead.lambda_per_mile`}
        label="Overhead rate (outages/mi/year)"
        helpText="Exposure-dependent overhead outage rate per mile."
        min={0}
        step={0.0001}
      />
      <NumberField
        path={`${OUTAGE}.outage_rate.underground`}
        label="Underground rate (outages/mi/year)"
        helpText="Line-level outage frequency for underground construction."
        min={0}
        step={0.0001}
      />
    </section>
  );
}
