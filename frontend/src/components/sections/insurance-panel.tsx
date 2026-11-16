import type { ReactElement } from 'react';
import { PercentageField } from '@/components/form/percentage-field';
import { useFormStore } from '@/stores/form-store';

const INSURANCE = '04_insurance.insurance';
const CONSTRUCTION_TYPE_PATH = '01_project_technical_details.project.construction_type';
const AC_DC_PATH = '01_project_technical_details.project.ac_dc';

interface RateField {
  path: string;
  label: string;
  helpText: string;
}

const LINE_RATE_BY_CONSTRUCTION_TYPE: Record<string, RateField> = {
  Overhead: {
    path: `${INSURANCE}.premium_rate_by_type.overhead`,
    label: 'Overhead premium rate (% of insurable value)',
    helpText:
      'Annual self-insurance reserve. Default 0.20%. Commercial T&D coverage is generally unavailable.',
  },
  'Underground Direct-Buried': {
    path: `${INSURANCE}.premium_rate_by_type.underground_direct_buried`,
    label: 'Direct-buried premium rate (% of insurable value)',
    helpText:
      'Same 0.20% reserve as overhead. Higher capital cost is captured in insurable value.',
  },
  'Underground Tunnel': {
    path: `${INSURANCE}.premium_rate_by_type.underground_tunnel`,
    label: 'Tunnel premium rate (% of insurable value)',
    helpText: 'Same 0.20% reserve as direct-buried underground.',
  },
};

const CONVERTER_RATE: RateField = {
  path: `${INSURANCE}.premium_rate_by_type.converter`,
  label: 'Converter premium rate (% of converter value)',
  helpText:
    'Commercial converter premium. Range about 0.4–1.0%. Default 0.70%. Independent of the line rate.',
};

const ESCALATION_RATE: RateField = {
  path: `${INSURANCE}.escalation_rate`,
  label: 'Insurance escalation (%/yr, real)',
  helpText:
    'Real annual growth of the premium. Default 2.0%/yr. Source: WTW (2025); Powerlink (2025).',
};

export function showConverterRate(acDc: unknown): boolean {
  return acDc === 'DC';
}

export function InsurancePanel(): ReactElement {
  const constructionType = useFormStore((state) => state.getFieldValue(CONSTRUCTION_TYPE_PATH));
  const acDc = useFormStore((state) => state.getFieldValue(AC_DC_PATH));
  const lineRate =
    typeof constructionType === 'string'
      ? LINE_RATE_BY_CONSTRUCTION_TYPE[constructionType]
      : undefined;

  return (
    <section id="operational-insurance" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Operational insurance</h2>
        <p className="text-sm text-slate-600">
          Annual premium is the construction-type rate times insured line value, plus the
          converter rate times insured converter value. Insured values appear after a calculation.
        </p>
      </div>
      {lineRate ? (
        <PercentageField
          path={lineRate.path}
          label={lineRate.label}
          helpText={lineRate.helpText}
        />
      ) : null}
      {showConverterRate(acDc) ? (
        <PercentageField
          path={CONVERTER_RATE.path}
          label={CONVERTER_RATE.label}
          helpText={CONVERTER_RATE.helpText}
        />
      ) : null}
      <PercentageField
        path={ESCALATION_RATE.path}
        label={ESCALATION_RATE.label}
        helpText={ESCALATION_RATE.helpText}
      />
      <PercentageField
        path={`${INSURANCE}.premium_rate_default`}
        label="Fallback premium rate (%)"
        helpText="Used only when the construction type has no specific rate. All default construction types have specific rates."
      />
    </section>
  );
}