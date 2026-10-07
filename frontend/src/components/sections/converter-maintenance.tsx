import { useState } from 'react';
import type { ReactElement } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { PercentageField } from '@/components/form/percentage-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getConverterDetails } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';
const CONFIGURE = 'Configure project first';

function readRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
}

export function ConverterMaintenance(): ReactElement {
  const [locked, setLocked] = useState(true);
  const lookups = useFormStore((state) => state.lookups);
  const acDc = useFormStore((state) => state.getFieldValue(`${PROJECT}.ac_dc`));
  const converterType = useFormStore((state) => state.getFieldValue(`${PROJECT}.converter_type`));
  const converterName = typeof converterType === 'string' ? converterType : '';
  const lookupRate =
    lookups && converterName ? readRate(getConverterDetails(lookups, converterName)) : null;
  const path = converterName
    ? `15_category_om_converters.converter_om_rate.${converterName}`
    : '';
  const stored = useFormStore((state) => (path ? state.getFieldValue(path) : undefined));

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

  const shown = readRate(stored) ?? lookupRate;

  return (
    <section id="converter-maintenance" className="grid max-w-xl gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Converter maintenance</h2>
          <p className="text-sm text-slate-600">
            Annual converter O&amp;M for {converterName}, as a percent of station capital cost.
          </p>
        </div>
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
      {locked ? (
        <Input
          aria-label="Converter O&M percent of station CAPEX"
          value={formatPercent(shown)}
          disabled
          readOnly
        />
      ) : (
        <PercentageField
          path={path}
          label="Annual converter O&M (% of station CAPEX)"
          helpText="Lookup default for this converter type. Unlock to override."
        />
      )}
    </section>
  );
}
