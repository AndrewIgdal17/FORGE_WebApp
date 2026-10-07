import type { ReactElement } from 'react';
import { CheckboxField } from '@/components/form/checkbox-field';
import { PercentageField } from '@/components/form/percentage-field';

const INSURANCE = '04_insurance.insurance';

const COMPONENTS: Array<{ key: string; label: string; helpText: string }> = [
  {
    key: 'conductors',
    label: 'Conductors',
    helpText: 'Include conductor capital cost in the insured value.',
  },
  {
    key: 'structures',
    label: 'Structures',
    helpText: 'Include structure capital cost in the insured value.',
  },
  {
    key: 'converters',
    label: 'Converters',
    helpText: 'Include converter capital cost in the insured value.',
  },
];

export function InsurancePanel(): ReactElement {
  return (
    <section id="operational-insurance" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Operational insurance</h2>
        <p className="text-sm text-slate-600">
          Annual premium is this rate times the insured capital cost. Insured values appear after a calculation.
        </p>
      </div>
      <PercentageField
        path={`${INSURANCE}.premium_rate_default`}
        label="Fallback premium rate (%)"
        helpText="Used only when the construction type has no specific rate. All default construction types have specific rates."
      />
      {COMPONENTS.map((component) => (
        <CheckboxField
          key={component.key}
          path={`${INSURANCE}.insurable_components.${component.key}`}
          label={component.label}
          helpText={component.helpText}
        />
      ))}
    </section>
  );
}
