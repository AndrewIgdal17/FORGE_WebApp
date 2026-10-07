import { useState } from 'react';
import type { ReactElement } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { CurrencyField } from '@/components/form/currency-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildCategoryKey, getConductorOm } from '@/lib/lookups';
import type { ProjectFields } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';
const CONFIGURE = 'Configure project first';

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatMoney(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function ConductorMaintenance(): ReactElement {
  const [locked, setLocked] = useState(true);
  const lookups = useFormStore((state) => state.lookups);
  const constructionType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.construction_type`),
  );
  const acDc = useFormStore((state) => state.getFieldValue(`${PROJECT}.ac_dc`));
  const capacityMw = useFormStore((state) => state.getFieldValue(`${PROJECT}.capacity_mw`));
  const conductorType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.conductor_type`),
  );
  const converterType = useFormStore((state) =>
    state.getFieldValue(`${PROJECT}.converter_type`),
  );

  const fields: ProjectFields = {
    constructionType: readString(constructionType),
    acDc: readString(acDc),
    capacityMw: readNumber(capacityMw),
    conductorType: readString(conductorType),
  };
  const converter = readString(converterType);
  if (converter) fields.converterType = converter;
  const categoryKey = buildCategoryKey(fields);
  const entry =
    lookups && categoryKey ? asRecord(getConductorOm(lookups, categoryKey)) : null;
  const path = categoryKey
    ? `13_category_om_conductors.project_categories_om_conductors.${categoryKey}.variable_cost_per_mile_year`
    : '';
  const stored = useFormStore((state) => (path ? state.getFieldValue(path) : undefined));

  if (!entry || !path) {
    return (
      <section id="conductor-maintenance">
        <p className="text-sm text-slate-600">{CONFIGURE}</p>
      </section>
    );
  }

  const shown = stored === undefined || stored === null ? entry.variable_cost_per_mile_year : stored;

  return (
    <section id="conductor-maintenance" className="grid max-w-3xl gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Conductor maintenance</h2>
          <p className="text-sm text-slate-600">
            Annual conductor O&amp;M for <span className="font-medium text-slate-900">{categoryKey}</span>.
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
          aria-label="Conductor O&M per mile per year"
          value={formatMoney(shown)}
          disabled
          readOnly
        />
      ) : (
        <CurrencyField
          path={path}
          label="Variable cost per mile per year"
          helpText="Annual conductor maintenance cost per mile. Unlock to override the lookup default."
        />
      )}
    </section>
  );
}
