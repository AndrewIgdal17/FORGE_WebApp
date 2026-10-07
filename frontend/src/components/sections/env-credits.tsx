import type { ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CurrencyField } from '@/components/form/currency-field';
import { terrainMilesPath } from '@/components/sections/terrain-mix';
import type { TerrainId } from '@/components/sections/terrain-mix';
import { milesToAcres } from '@/lib/geometry';
import { buildCategoryKey, getRowWidthFeet } from '@/lib/lookups';
import type { ProjectFields } from '@/lib/lookups';
import { useFormStore } from '@/stores/form-store';

const PROJECT = '01_project_technical_details.project';
const ENV = '09_environmental_mitigation.environmental_mitigation';
const UPLIFT_PATH = `${ENV}.mitigation_uplift_factor`;
const CONFIGURE = 'Configure project first';

const CREDITS: Array<{ label: string; terrain: TerrainId; path: string; helpText: string }> = [
  {
    label: 'Wetland',
    terrain: 'wetland',
    path: `${ENV}.wetland_credit_cost_per_acre`,
    helpText: 'Per-acre credit purchase cost for wetland mitigation banking.',
  },
  {
    label: 'Habitat — forested',
    terrain: 'forested',
    path: `${ENV}.habitat_credit_cost_per_acre.forested`,
    helpText: 'Per-acre habitat credit cost for forested terrain.',
  },
  {
    label: 'Habitat — scrubbed flat',
    terrain: 'scrubbed_flat',
    path: `${ENV}.habitat_credit_cost_per_acre.scrubbed_flat`,
    helpText: 'Per-acre habitat credit cost for scrubbed flat terrain.',
  },
  {
    label: 'Habitat — desert/barren',
    terrain: 'desert_barren',
    path: `${ENV}.habitat_credit_cost_per_acre.desert_barren`,
    helpText: 'Per-acre habitat credit cost for desert or barren terrain.',
  },
  {
    label: 'Habitat — rolling hills',
    terrain: 'rolling_hills',
    path: `${ENV}.habitat_credit_cost_per_acre.rolling_hills`,
    helpText: 'Per-acre habitat credit cost for rolling hills.',
  },
  {
    label: 'Habitat — mountain',
    terrain: 'mountain',
    path: `${ENV}.habitat_credit_cost_per_acre.mountain`,
    helpText: 'Per-acre habitat credit cost for mountain terrain.',
  },
];

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

function formatAcres(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function EnvCredits(): ReactElement {
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
  const upliftRaw = useFormStore((state) => state.getFieldValue(UPLIFT_PATH));
  const uplift = upliftRaw === undefined || upliftRaw === null ? 1 : readNumber(upliftRaw);
  const milesByTerrain = useFormStore(
    useShallow((state) => {
      const miles: Partial<Record<TerrainId, number>> = {};
      for (const credit of CREDITS) {
        miles[credit.terrain] = readNumber(state.getFieldValue(terrainMilesPath(credit.terrain)));
      }
      return miles;
    }),
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
  const rowWidth = lookups && categoryKey ? getRowWidthFeet(lookups, categoryKey) : null;

  let totalAcres = 0;
  if (rowWidth !== null) {
    for (const credit of CREDITS) {
      const miles = milesByTerrain[credit.terrain] ?? 0;
      if (miles > 0) totalAcres += milesToAcres(miles, rowWidth) * uplift;
    }
  }

  return (
    <section id="credits" className="grid max-w-4xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Environmental credits</h2>
        <p className="text-sm text-slate-600">
          Off-site wetland and habitat credit purchases. Acres follow route miles, ROW width, and the mitigation uplift factor.
        </p>
      </div>
      <p className="text-sm text-slate-600">
        Total effective acres{' '}
        <span className="font-medium text-slate-900">
          {rowWidth === null ? CONFIGURE : formatAcres(totalAcres)}
        </span>
      </p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Habitat and wetland credit cost per acre</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Credit type</th>
              <th className="px-3 py-2">Acres impacted</th>
              <th className="px-3 py-2">Cost ($/acre)</th>
            </tr>
          </thead>
          <tbody>
            {CREDITS.map((credit) => {
              const miles = milesByTerrain[credit.terrain] ?? 0;
              const acres =
                rowWidth !== null && miles > 0 ? milesToAcres(miles, rowWidth) * uplift : 0;
              return (
                <tr key={credit.path} className="border-b last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
                    {credit.label}
                  </th>
                  <td className="px-3 py-2 text-sm tabular-nums text-slate-700">
                    {rowWidth === null ? CONFIGURE : formatAcres(acres)}
                  </td>
                  <td className={cellFieldClass}>
                    <CurrencyField
                      path={credit.path}
                      label={`${credit.label} cost per acre`}
                      helpText={credit.helpText}
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
