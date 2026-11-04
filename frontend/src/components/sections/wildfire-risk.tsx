import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { PercentageField } from '@/components/form/percentage-field';

const WILDFIRE = '06_wildfire_costs.wildfire';

const CONSTRUCTION_TYPES = [
  { key: 'overhead', label: 'Overhead' },
  { key: 'underground', label: 'Underground' },
] as const;

export function WildfireRisk(): ReactElement {
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
      <h3 className="text-sm font-semibold text-slate-900">Construction type multipliers</h3>
      {CONSTRUCTION_TYPES.map((construction) => (
        <NumberField
          key={construction.key}
          path={`${WILDFIRE}.ignition_rate_multiplier.${construction.key}`}
          label={`${construction.label} ignition multiplier`}
          helpText={`Multiplier on the base ignition rate for ${construction.label.toLowerCase()} construction.`}
          min={0}
          step={0.01}
        />
      ))}
    </section>
  );
}
