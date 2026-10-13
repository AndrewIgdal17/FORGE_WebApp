import { useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import type { Feature, LineString, MultiLineString } from 'geojson';
import length from '@turf/length';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { TERRAIN_IDS } from '@/components/sections/terrain-mix';
import type { TerrainId } from '@/components/sections/terrain-mix';
import type { AnalyzeResponse } from '@/lib/api';
import { getValueAtPath } from '@/lib/path';
import { useFormStore } from '@/stores/form-store';

const PANEL =
  'absolute top-4 left-4 z-10 w-72 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-sm';

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

const TERRAIN_PATH_PREFIX = '02_project_physical_details.terrain.terrain_miles.';
const ZONE_PATH_PREFIX = '11_project_row_details.right_of_way.';

export interface RouteStatsProps {
  route: MultiLineString | null;
  isDrawing: boolean;
  result: AnalyzeResponse | null;
  loading: boolean;
  error: Error | null;
}

interface ZoneRow {
  zone: number;
  miles: number;
}

function stopMapPointer(event: SyntheticEvent): void {
  event.stopPropagation();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asMiles(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function formatMiles(miles: number): string {
  return `${miles.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} mi`;
}

function routeMiles(route: MultiLineString): number {
  return route.coordinates.reduce((sum, coordinates) => {
    if (coordinates.length < 2) return sum;
    const feature: Feature<LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    };
    return sum + length(feature, { units: 'miles' });
  }, 0);
}

function terrainFromBag(bag: unknown, changes: Record<string, unknown>): Record<TerrainId, number> {
  const record = isRecord(bag) ? bag : {};
  const miles = {} as Record<TerrainId, number>;
  for (const id of TERRAIN_IDS) {
    miles[id] = asMiles(record[id]) ?? asMiles(changes[`${TERRAIN_PATH_PREFIX}${id}`]) ?? 0;
  }
  return miles;
}

function zonesFromBag(bag: unknown, changes: Record<string, unknown>): ZoneRow[] {
  const record = isRecord(bag) ? bag : {};
  const rows: ZoneRow[] = [];
  for (let zone = 1; zone <= 15; zone += 1) {
    const key = `zone_${zone}`;
    const miles =
      asMiles(record[key]) ?? asMiles(changes[`${ZONE_PATH_PREFIX}${key}.miles`]) ?? 0;
    if (miles > 0) rows.push({ zone, miles });
  }
  return rows;
}

function terrainFromForm(data: Record<string, unknown>): Record<TerrainId, number> {
  const miles = {} as Record<TerrainId, number>;
  for (const id of TERRAIN_IDS) {
    miles[id] = asMiles(getValueAtPath(data, `${TERRAIN_PATH_PREFIX}${id}`)) ?? 0;
  }
  return miles;
}

function zonesFromForm(data: Record<string, unknown>): ZoneRow[] {
  const rows: ZoneRow[] = [];
  for (let zone = 1; zone <= 15; zone += 1) {
    const miles = asMiles(getValueAtPath(data, `${ZONE_PATH_PREFIX}zone_${zone}.miles`)) ?? 0;
    if (miles > 0) rows.push({ zone, miles });
  }
  return rows;
}

export function RouteStats({
  route,
  isDrawing,
  result,
  loading,
  error,
}: RouteStatsProps): ReactElement {
  const [minimized, setMinimized] = useState(false);
  const formData = useFormStore((state) => state.data);
  const liveMiles = route ? routeMiles(route) : null;
  const showServerTotal = result !== null && !isDrawing && !loading;
  const total = showServerTotal ? result.total_miles : liveMiles;

  const stored = route !== null && !isDrawing && result === null ? formData : null;
  const terrain = result
    ? terrainFromBag(result.intersections['terrain/nlcd'], result.changes)
    : stored
      ? terrainFromForm(stored)
      : null;
  const zones = result
    ? zonesFromBag(result.intersections['row/blm'], result.changes)
    : stored
      ? zonesFromForm(stored)
      : [];
  const showBreakdown =
    terrain !== null && (result !== null || zones.length > 0 || hasPositive(terrain));
  const dimmed = loading || isDrawing;
  const totalLabel = total === null ? 'No route' : formatMiles(total);

  if (minimized) {
    return (
      <button
        type="button"
        className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-sm"
        aria-expanded={false}
        aria-label="Show route summary"
        onClick={() => setMinimized(false)}
        onPointerDown={stopMapPointer}
      >
        <MapPin className="size-4 text-blue-500" />
        <span className="tabular-nums">{totalLabel}</span>
        <ChevronUp className="size-4 text-slate-500" />
      </button>
    );
  }

  return (
    <section className={PANEL} aria-label="Route summary" onPointerDown={stopMapPointer}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MapPin className="size-4 text-blue-500" />
          Route
        </h2>
        <button
          type="button"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label="Minimize route summary"
          onClick={() => setMinimized(true)}
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-900 tabular-nums" aria-live="polite">
        {total === null ? '—' : formatMiles(total)}
      </p>
      {loading ? <p className="text-xs text-slate-500">Analyzing...</p> : null}
      {error && !isDrawing ? (
        <p className="mt-1 text-xs break-words text-red-600">{error.message}</p>
      ) : null}
      {showBreakdown && terrain ? (
        <div className={`mt-3 max-h-[min(60vh,28rem)] overflow-y-auto ${dimmed ? 'opacity-50' : ''}`}>
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">Terrain</h3>
          <ul className="mt-1 grid gap-1">
            {TERRAIN_IDS.map((id) => (
              <li key={id} className="flex items-baseline justify-between gap-3 text-sm text-slate-800">
                <span>{TERRAIN_LABELS[id]}</span>
                <span className="tabular-nums text-slate-600">{formatMiles(terrain[id])}</span>
              </li>
            ))}
          </ul>
          {zones.length > 0 ? (
            <>
              <h3 className="mt-3 text-xs font-medium tracking-wide text-slate-500 uppercase">Zones</h3>
              <ul className="mt-1 grid gap-1">
                {zones.map((row) => (
                  <li
                    key={row.zone}
                    className="flex items-baseline justify-between gap-3 text-sm text-slate-800"
                  >
                    <span>Zone {row.zone}</span>
                    <span className="tabular-nums text-slate-600">{formatMiles(row.miles)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          {route
            ? 'Terrain and zone miles appear after the route is finished.'
            : 'Draw a route on the map to calculate terrain.'}
        </p>
      )}
    </section>
  );
}

function hasPositive(miles: Record<TerrainId, number>): boolean {
  return TERRAIN_IDS.some((id) => miles[id] > 0);
}
