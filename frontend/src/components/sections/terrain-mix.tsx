import type { ReactElement } from 'react';
import { NumberField } from '@/components/form/number-field';
import { getValueAtPath } from '@/lib/path';
import { useFormStore } from '@/stores/form-store';

const CONSTRUCTION_TYPE_PATH = '01_project_technical_details.project.construction_type';
const TERRAIN_ROOT = '02_project_physical_details.terrain';

export const TERRAIN_IDS = [
  'forested',
  'scrubbed_flat',
  'wetland',
  'farmland',
  'desert_barren',
  'urban',
  'rolling_hills',
  'mountain',
  'subsea',
] as const;

export type TerrainId = (typeof TERRAIN_IDS)[number];

const TERRAIN_LABELS: Record<TerrainId, string> = {
  forested: 'Forested',
  scrubbed_flat: 'Scrubbed Flat',
  wetland: 'Wetland',
  farmland: 'Farmland',
  desert_barren: 'Desert/Barren',
  urban: 'Urban',
  rolling_hills: 'Rolling Hills',
  mountain: 'Mountain',
  subsea: 'Subsea',
};

const cellFieldClass = '[&_label]:sr-only';

export function terrainsForConstruction(constructionType: unknown): TerrainId[] {
  if (constructionType === 'Subsea') return ['subsea'];
  return TERRAIN_IDS.filter((terrain) => terrain !== 'subsea');
}

export function terrainMilesPath(terrain: TerrainId): string {
  return `${TERRAIN_ROOT}.terrain_miles.${terrain}`;
}

function multiplierPath(terrain: TerrainId): string {
  return `${TERRAIN_ROOT}.terrain_multipliers.${terrain}`;
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatFixed(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

interface TerrainRowProps {
  terrain: TerrainId;
}

function storedOrDefault(state: {
  getFieldValue: (path: string) => unknown;
  defaults: Record<string, unknown> | null;
}, path: string): unknown {
  const current = state.getFieldValue(path);
  if (current !== undefined && current !== null && current !== '') return current;
  if (!state.defaults) return undefined;
  return getValueAtPath(state.defaults, path);
}

function TerrainRow({ terrain }: TerrainRowProps): ReactElement {
  const label = TERRAIN_LABELS[terrain];
  const milesPath = terrainMilesPath(terrain);
  const multPath = multiplierPath(terrain);
  const miles = useFormStore((state) => readNumber(state.getFieldValue(milesPath)));
  const multiplier = useFormStore((state) =>
    readNumber(storedOrDefault(state, multPath)),
  );
  const weighted = miles * multiplier;

  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className="px-3 py-2 text-left text-sm font-medium text-slate-800">
        {label}
      </th>
      <td className={`px-2 py-1.5 ${cellFieldClass}`}>
        <NumberField
          path={milesPath}
          label={`${label} miles`}
          min={0}
        />
      </td>
      <td className={`px-2 py-1.5 ${cellFieldClass}`}>
        <NumberField
          path={multPath}
          label={`${label} multiplier`}
          min={0}
          step={0.1}
        />
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-700">
        {formatFixed(weighted)}
      </td>
    </tr>
  );
}

export function TerrainMix(): ReactElement {
  const constructionType = useFormStore((state) =>
    state.getFieldValue(CONSTRUCTION_TYPE_PATH),
  );
  const terrains = terrainsForConstruction(constructionType);
  const totalMiles = useFormStore((state) =>
    terrains.reduce(
      (sum, terrain) => sum + readNumber(state.getFieldValue(terrainMilesPath(terrain))),
      0,
    ),
  );
  const totalWeighted = useFormStore((state) =>
    terrains.reduce((sum, terrain) => {
      const rowMiles = readNumber(state.getFieldValue(terrainMilesPath(terrain)));
      const multiplier = readNumber(storedOrDefault(state, multiplierPath(terrain)));
      return sum + rowMiles * multiplier;
    }, 0),
  );

  return (
    <section id="terrain-mix" className="grid max-w-4xl gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Terrain miles</h2>
        <p className="text-sm text-slate-600">
          Route miles by terrain. Miles should sum to the project length.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Terrain miles, multipliers, and weighted miles</caption>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Terrain</th>
              <th className="px-3 py-2">Miles</th>
              <th className="px-3 py-2">Multiplier</th>
              <th className="px-3 py-2 text-right">Weighted miles</th>
            </tr>
          </thead>
          <tbody>
            {terrains.map((terrain) => (
              <TerrainRow key={terrain} terrain={terrain} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-100 text-sm font-bold text-slate-900">
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              <td className="px-3 py-2 tabular-nums">{formatFixed(totalMiles)}</td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums">
                {formatFixed(totalWeighted)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
