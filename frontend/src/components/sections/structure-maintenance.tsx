import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { PercentageField } from '@/components/form/percentage-field';
import { getStructureDetails, normalizeCT } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const CONSTRUCTION_TYPE_PATH = '01_project_technical_details.project.construction_type';
const STRUCTURE_ROOT = '14_category_om_structures.project_categories_om_structures';
const CONFIGURE = 'Configure project first';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function StructureMaintenance(): ReactElement {
  const lookups = useFormStore((state) => state.lookups);
  const constructionType = useFormStore((state) => state.getFieldValue(CONSTRUCTION_TYPE_PATH));
  const ct =
    typeof constructionType === 'string' && constructionType !== ''
      ? normalizeCT(constructionType)
      : '';
  const entry = lookups && ct ? asRecord(getStructureDetails(lookups, ct)) : null;
  const isOverhead = ct === 'Overhead';
  const fieldKey = isOverhead ? 'base_om_per_mile_year' : 'om_pct_of_line_capex';
  const path = ct ? `${STRUCTURE_ROOT}.${ct}.${fieldKey}` : '';

  if (!entry || !path) {
    return (
      <section id="structure-maintenance">
        <p className="text-sm text-slate-600">{CONFIGURE}</p>
      </section>
    );
  }

  const label = isOverhead ? 'Base O&M ($/mile/year)' : 'O&M (% of line CAPEX/year)';

  return (
    <section id="structure-maintenance" className="grid max-w-xl gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Structure maintenance</h2>
        <p className="text-sm text-slate-600">
          Structure O&amp;M for {ct}. Overhead is a per-mile rate. Other construction types are a percent of line capital cost.
        </p>
      </div>
      {isOverhead ? (
        <CurrencyField
          path={path}
          label={label}
          helpText="Annual structure maintenance per mile, excluding vegetation management."
        />
      ) : (
        <PercentageField
          path={path}
          label={label}
          helpText="Annual line O&M as a percent of line capital cost."
        />
      )}
    </section>
  );
}
