import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const OUTAGE = '07_outage_costs.outage';
const CAPACITY_PATH = `${OUTAGE}.capacity_at_risk_factor`;
const LOAD_SHED_PATH = `${OUTAGE}.load_shed_fraction`;

export const LOAD_SHED_HELP =
  "Share of lost power shed as unserved energy and priced at the value of lost load. Default 0.05 for AC and DC lines alike (ENTSO-E 2021). The rest is redispatched at the route's congestion spread.";

const DURATION_TYPES = [
  { key: 'overhead', label: 'Overhead' },
  { key: 'underground', label: 'Underground' },
] as const;

export function OutageRisk(): ReactElement {
  const capacity = useFormStore((state) => state.getFieldValue(CAPACITY_PATH));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const automatic = capacity === 'auto';

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
      <PercentageField
        path={LOAD_SHED_PATH}
        label="Load-shed fraction (%)"
        helpText={LOAD_SHED_HELP}
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