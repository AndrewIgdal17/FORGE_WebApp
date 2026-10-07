import type { ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CurrencyField } from '@/components/form/currency-field';
import { NumberField } from '@/components/form/number-field';
import { TERRAIN_IDS, terrainMilesPath } from '@/components/sections/terrain-mix';
import type { TerrainId } from '@/components/sections/terrain-mix';
import { milesToAcres } from '@/lib/geometry';
import { buildCategoryKey, getRowWidthFeet } from '@/lib/lookups';
import type { ProjectFields } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';
const ENV = '09_environmental_mitigation.environmental_mitigation';
const UPLIFT_PATH = `${ENV}.mitigation_uplift_factor`;

const CONFIGURE = 'Configure project first';

const TERRAIN_LABELS: Record<string, string> = {
  forested: 'Forested',
  scrubbed_flat: 'Scrubbed flat',
  wetland: 'Wetland',
  farmland: 'Farmland',
  desert_barren: 'Desert/barren',
  urban: 'Urban',
  rolling_hills: 'Rolling hills',
  mountain: 'Mountain',
  subsea: 'Subsea',
  linear_corridor_default: 'Linear corridor',
  shaft_site_default: 'Shaft site',
  seabed_corridor_default: 'Seabed corridor',
  landfall_default: 'Landfall',
};

const ENV_TERRAINS: Record<string, { key: string; terrains: string[] }> = {
  Overhead: {
    key: 'overhead',
    terrains: [...TERRAIN_IDS],
  },
  'Underground Direct-Buried': {
    key: 'underground_direct_buried',
    terrains: [...TERRAIN_IDS],
  },
  'Underground Tunnel': {
    key: 'underground_tunnel',
    terrains: [...TERRAIN_IDS, 'linear_corridor_default', 'shaft_site_default'],
  },
  Subsea: {
    key: 'subsea',
    terrains: ['seabed_corridor_default', 'landfall_default'],
  },
};

const cellFieldClass = 'px-2 py-1.5 [&_label]:sr-only';

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readCapacity(value: unknown): number {
  return readNumber(value);
}

function isTerrainId(terrain: string): terrain is TerrainId {
  return (TERRAIN_IDS as readonly string[]).includes(terrain);
}

function formatAcres(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function projectFields(values: {
  constructionType: unknown;
  acDc: unknown;
  capacityMw: unknown;
  conductorType: unknown;
  converterType: unknown;
}): ProjectFields {
  const fields: ProjectFields = {
    constructionType: readString(values.constructionType),
    acDc: readString(values.acDc),
    capacityMw: readCapacity(values.capacityMw),
    conductorType: readString(values.conductorType),
  };
  const converterType = readString(values.converterType);
  if (converterType) fields.converterType = converterType;
  return fields;
}

export function BaseMitigation(): ReactElement {
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
  const uplift = useFormStore((state) => readNumber(state.getFieldValue(UPLIFT_PATH)) || 1);
  const milesByTerrain = useFormStore(
    useShallow((state) => {
      const miles: Record<string, number> = {};
      for (const terrain of TERRAIN_IDS) {
        miles[terrain] = readNumber(state.getFieldValue(terrainMilesPath(terrain)));
      }
      return miles;
    }),
  );

  const ctLabel = readString(constructionType) || 'Overhead';
  const ctInfo = ENV_TERRAINS[ctLabel] ?? ENV_TERRAINS.Overhead;
  const categoryKey = buildCategoryKey(
    projectFields({ constructionType, acDc, capacityMw, conductorType, converterType }),
  );
  const rowWidth = lookups && categoryKey ? getRowWidthFeet(lookups, categoryKey) : null;

  let totalAcres = 0;
  if (rowWidth !== null) {
    for (const terrain of ctInfo.terrains) {
      if (!isTerrainId(terrain)) continue;
      const miles = milesByTerrain[terrain] ?? 0;
      if (miles > 0) totalAcres += milesToAcres(miles, rowWidth) * uplift;
    }
  }

  return (
    <section id="base-mitigation" className="grid max-w-4xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Base mitigation</h2>
        <p className="text-sm text-slate-600">
          Per-acre restoration cost by terrain for {ctLabel}. Impacted acres use route miles, ROW width, and the uplift factor.
        </p>
      </div>
      <NumberField
        path={UPLIFT_PATH}
        label="Mitigation uplift factor"
        helpText="Temporary construction easement factor applied to ROW width."
        min={0}
        step={0.05}
      />
      <p className="text-sm text-slate-600">
        Total effective acres{' '}
        <span className="font-medium text-slate-900">
          {rowWidth === null ? CONFIGURE : formatAcres(totalAcres)}
        </span>
      </p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Base mitigation cost per acre by terrain</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Terrain</th>
              <th className="px-3 py-2">Acres impacted</th>
              <th className="px-3 py-2">Cost ($/acre)</th>
            </tr>
          </thead>
          <tbody>
            {ctInfo.terrains.map((terrain) => {
              const miles = isTerrainId(terrain) ? (milesByTerrain[terrain] ?? 0) : 0;
              const acres =
                rowWidth !== null && isTerrainId(terrain) && miles > 0
                  ? milesToAcres(miles, rowWidth) * uplift
                  : 0;
              const acresLabel = !isTerrainId(terrain)
                ? '—'
                : rowWidth === null
                  ? CONFIGURE
                  : formatAcres(acres);
              return (
                <tr key={terrain} className="border-b last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                    {TERRAIN_LABELS[terrain] ?? terrain}
                  </th>
                  <td className="px-3 py-2 text-sm tabular-nums text-slate-700">{acresLabel}</td>
                  <td className={cellFieldClass}>
                    <CurrencyField
                      path={`${ENV}.base_mitigation_cost_per_acre.${ctInfo.key}.${terrain}`}
                      label={`${TERRAIN_LABELS[terrain] ?? terrain} cost per acre`}
                      helpText="Per-acre mitigation cost for this terrain and construction type."
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
