import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
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

export function ConductorMaintenance(): ReactElement {
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

  if (!entry || !path) {
    return (
      <section id="conductor-maintenance">
        <p className="text-sm text-slate-600">{CONFIGURE}</p>
      </section>
    );
  }

  return (
    <section id="conductor-maintenance" className="grid max-w-3xl gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Conductor maintenance</h2>
        <p className="text-sm text-slate-600">
          Annual conductor O&amp;M for <span className="font-medium text-slate-900">{categoryKey}</span>.
        </p>
      </div>
      <CurrencyField
        path={path}
        label="Variable cost per mile per year"
        helpText="Annual conductor maintenance cost per mile."
      />
    </section>
  );
}
