import type { ReactElement } from 'react';
import { PercentageField } from '@/components/form/percentage-field';
import { getConverterDetails } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';
const CONFIGURE = 'Configure project first';

function readRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function ConverterMaintenance(): ReactElement {
  const lookups = useFormStore((state) => state.lookups);
  const acDc = useFormStore((state) => state.getFieldValue(`${PROJECT}.ac_dc`));
  const converterType = useFormStore((state) => state.getFieldValue(`${PROJECT}.converter_type`));
  const converterName = typeof converterType === 'string' ? converterType : '';
  const lookupRate =
    lookups && converterName ? readRate(getConverterDetails(lookups, converterName)) : null;
  const path = converterName
    ? `15_category_om_converters.converter_om_rate.${converterName}`
    : '';

  if (acDc !== 'DC') {
    return (
      <section id="converter-maintenance">
        <p className="text-sm text-slate-600">Converter maintenance applies to DC projects.</p>
      </section>
    );
  }

  if (lookupRate === null || !path) {
    return (
      <section id="converter-maintenance">
        <p className="text-sm text-slate-600">{CONFIGURE}</p>
      </section>
    );
  }

  return (
    <section id="converter-maintenance" className="grid max-w-xl gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Converter maintenance</h2>
        <p className="text-sm text-slate-600">
          Annual converter O&amp;M for {converterName}, as a percent of station capital cost.
        </p>
      </div>
      <PercentageField
        path={path}
        label="Annual converter O&M (% of station CAPEX)"
        helpText="Annual converter O&M as a percent of station capital cost for this converter type."
      />
    </section>
  );
}
