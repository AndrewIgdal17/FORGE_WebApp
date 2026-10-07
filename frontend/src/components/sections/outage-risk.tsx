import { useState } from 'react';
import type { ReactElement } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { Input } from '@/components/ui/input';
import { useFormStore } from '@/stores/form-store';

const OUTAGE = '07_outage_costs.outage';
const AC_DC_PATH = '01_project_technical_details.project.ac_dc';
const CAPACITY_PATH = `${OUTAGE}.capacity_at_risk_factor`;

const DURATION_TYPES = [
  { key: 'overhead', label: 'Overhead' },
  { key: 'underground', label: 'Underground' },
  { key: 'subsea', label: 'Subsea' },
] as const;

function formatMultiplier(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

export function OutageRisk(): ReactElement {
  const [locked, setLocked] = useState(true);
  const acDc = useFormStore((state) => state.getFieldValue(AC_DC_PATH));
  const capacity = useFormStore((state) => state.getFieldValue(CAPACITY_PATH));
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const loadShed = acDc === 'DC' ? '0.80' : '0.05';
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
              label="Capacity at risk factor"
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
          label="Capacity at risk factor"
          helpText="Leave this blank to keep the automatic value, or enter a fraction from 0 to 1."
          min={0}
          max={1}
          step={0.01}
        />
      ) : null}
      <p className="text-sm text-slate-600">
        Load-shed fraction{' '}
        <span className="font-medium text-slate-900">{loadShed}</span>
        <span className="block">Derived from AC/DC. AC is 0.05 and DC is 0.80.</span>
      </p>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Duration multipliers</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLocked((current) => !current)}
        >
          {locked ? <Lock /> : <LockOpen />}
          {locked ? 'Locked — click to override' : 'Unlocked — editing'}
        </Button>
      </div>
      {DURATION_TYPES.map((construction) => (
        <DurationRow
          key={construction.key}
          label={construction.label}
          path={`${OUTAGE}.outage_duration_multiplier.${construction.key}`}
          locked={locked}
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
      <NumberField
        path={`${OUTAGE}.outage_rate.subsea`}
        label="Subsea rate (outages/mi/year)"
        helpText="Line-level outage frequency for subsea construction."
        min={0}
        step={0.0001}
      />
    </section>
  );
}

function DurationRow({
  label,
  path,
  locked,
}: {
  label: string;
  path: string;
  locked: boolean;
}): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  if (locked) {
    return (
      <Input
        aria-label={`${label} duration multiplier`}
        value={formatMultiplier(value)}
        disabled
        readOnly
      />
    );
  }
  return (
    <NumberField
      path={path}
      label={`${label} duration multiplier`}
      helpText={`Multiplier on base outage duration for ${label.toLowerCase()} construction.`}
      min={0}
    />
  );
}
