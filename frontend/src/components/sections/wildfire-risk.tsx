import { useState } from 'react';
import type { ReactElement } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFormStore } from '@/stores/form-store';

const WILDFIRE = '06_wildfire_costs.wildfire';

const CONSTRUCTION_TYPES = [
  { key: 'overhead', label: 'Overhead' },
  { key: 'underground', label: 'Underground' },
  { key: 'subsea', label: 'Subsea' },
] as const;

function formatMultiplier(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

export function WildfireRisk(): ReactElement {
  const [locked, setLocked] = useState(true);

  return (
    <section id="wildfire-risk" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Wildfire risk</h2>
        <p className="text-sm text-slate-600">
          Expected wildfire cost from a base ignition rate, a construction-type multiplier, and loss per event.
        </p>
      </div>
      <CurrencyField
        path={`${WILDFIRE}.severity_per_event`}
        label="Severity per event ($/event)"
        helpText="Mean uninsured loss per wildfire event."
      />
      <PercentageField
        path={`${WILDFIRE}.risk_growth_rate`}
        label="Risk growth rate (%)"
        helpText="Annual increase in ignition probability. Zero holds the rate constant."
      />
      <NumberField
        path={`${WILDFIRE}.base_ignition_rate`}
        label="Base ignition rate (events/mi/yr)"
        helpText="Overhead baseline. Effective rate equals base times the construction-type multiplier."
        min={0}
        step={0.001}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Construction type multipliers</h3>
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
      {CONSTRUCTION_TYPES.map((construction) => (
        <MultiplierRow
          key={construction.key}
          label={construction.label}
          path={`${WILDFIRE}.ignition_rate_multiplier.${construction.key}`}
          locked={locked}
        />
      ))}
    </section>
  );
}

function MultiplierRow({
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
        aria-label={`${label} ignition multiplier`}
        value={formatMultiplier(value)}
        disabled
        readOnly
      />
    );
  }
  return (
    <NumberField
      path={path}
      label={`${label} ignition multiplier`}
      helpText={`Multiplier on the base ignition rate for ${label.toLowerCase()} construction.`}
      min={0}
      step={0.01}
    />
  );
}
