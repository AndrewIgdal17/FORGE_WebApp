import type { ReactElement } from 'react';
import { CurrencyField } from '@/components/form/currency-field';
import { TERRAIN_IDS } from '@/components/sections/terrain-mix';
import type { TerrainId } from '@/components/sections/terrain-mix';
import { getVegetationManagement } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const CONSTRUCTION_TYPE_PATH = '01_project_technical_details.project.construction_type';
const VEG_ROOT = '12_project_om_vegetation_management.vegetation_management_om_costs';
const CONFIGURE = 'Configure project first';

const TERRAIN_LABELS: Record<TerrainId, string> = {
  forested: 'Forested',
  scrubbed_flat: 'Scrubbed flat',
  wetland: 'Wetland',
  farmland: 'Farmland',
  desert_barren: 'Desert/barren',
  urban: 'Urban',
  rolling_hills: 'Rolling hills',
  mountain: 'Mountain',
  subsea: 'Subsea',
};

/** Form construction types mapped onto vegetation-management YAML keys. */
const VEG_LOOKUP_KEY: Record<string, string> = {
  Overhead: 'Overhead',
  'Underground Direct-Buried': 'Underground Direct Buried',
  'Underground Tunnel': 'Underground Tunnel',
  Subsea: 'Subsea',
};

const cellFieldClass = 'px-2 py-1.5 [&_label]:sr-only';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function costPath(lookupKey: string, terrain: TerrainId): string {
  return `${VEG_ROOT}.${lookupKey}.${terrain}`;
}

export function VegetationMgmt(): ReactElement {
  const lookups = useFormStore((state) => state.lookups);
  const constructionType = useFormStore((state) => state.getFieldValue(CONSTRUCTION_TYPE_PATH));
  const lookupKey =
    typeof constructionType === 'string' ? VEG_LOOKUP_KEY[constructionType] : undefined;
  const entry =
    lookups && lookupKey ? asRecord(getVegetationManagement(lookups, lookupKey)) : null;

  if (!entry || !lookupKey) {
    return (
      <section id="vegetation-management">
        <p className="text-sm text-slate-600">{CONFIGURE}</p>
      </section>
    );
  }

  return (
    <section id="vegetation-management" className="grid max-w-3xl gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Vegetation management</h2>
        <p className="text-sm text-slate-600">
          Annual per-mile cost by terrain for {String(constructionType)}. Defaults come from the lookup table.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[28rem] border-collapse">
          <caption className="sr-only">Vegetation management cost per mile by terrain</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Terrain</th>
              <th className="px-3 py-2">Cost ($/mile/year)</th>
            </tr>
          </thead>
          <tbody>
            {TERRAIN_IDS.map((terrain) => {
              const path = costPath(lookupKey, terrain);
              return (
                <VegetationRow key={terrain} terrain={terrain} path={path} />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VegetationRow({
  terrain,
  path,
}: {
  terrain: TerrainId;
  path: string;
}): ReactElement {
  const label = TERRAIN_LABELS[terrain];

  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
        {label}
      </th>
      <td className={cellFieldClass}>
        <CurrencyField
          path={path}
          label={`${label} vegetation cost`}
          helpText="Annual vegetation management cost per mile for this terrain."
        />
      </td>
    </tr>
  );
}
