import { useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SUBREGION_COLORS, VOLTAGE_STYLES } from '@/data/color-maps';
import { useMapStore } from '@/stores/map-store';

const PANEL =
  'absolute bottom-16 left-4 z-10 w-56 max-h-[min(20rem,calc(100%-6rem))] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-sm';

const CHIP =
  'absolute bottom-16 left-4 z-10 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-sm';

function stopMapPointer(event: SyntheticEvent): void {
  event.stopPropagation();
}

function visibleVoltageStyles(hidden: readonly string[]) {
  return VOLTAGE_STYLES.filter((style) => {
    const voltClass = style.voltClass.trim();
    return voltClass.length > 0 && voltClass !== 'NOT AVAILABLE' && !hidden.includes(style.voltClass);
  });
}

function visibleRegionEntries(hidden: readonly string[]): ReadonlyArray<readonly [string, string]> {
  return Object.entries(SUBREGION_COLORS).filter(([code]) => !hidden.includes(code));
}

function CorridorLegend({ hidden }: { hidden: readonly string[] }): ReactElement | null {
  const rows = visibleVoltageStyles(hidden);
  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Corridors
      </h3>
      <ul className="grid gap-1">
        {rows.map((style) => (
          <li key={style.voltClass} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1 w-5 shrink-0 rounded-full"
              style={{ backgroundColor: style.color }}
            />
            <span className="text-xs text-slate-700">{style.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BLM_ZONE_LEGEND: ReadonlyArray<{ zone: number; color: string }> = [
  { zone: 1, color: '#fef3c7' },
  { zone: 2, color: '#fde68a' },
  { zone: 3, color: '#fde68a' },
  { zone: 4, color: '#fcd34d' },
  { zone: 5, color: '#fbbf24' },
  { zone: 6, color: '#f9a80d' },
  { zone: 7, color: '#f59e0b' },
  { zone: 8, color: '#e78e08' },
  { zone: 9, color: '#d97706' },
  { zone: 10, color: '#c26a06' },
  { zone: 11, color: '#b45309' },
  { zone: 12, color: '#a34604' },
  { zone: 13, color: '#92400e' },
  { zone: 14, color: '#854d0e' },
  { zone: 15, color: '#78350f' },
];

function BLMZoneLegend(): ReactElement {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        BLM Zones
      </h3>
      <div className="flex items-center gap-0.5">
        {BLM_ZONE_LEGEND.map(({ zone, color }) => (
          <div
            key={zone}
            title={`Zone ${zone}`}
            className="h-3 flex-1 first:rounded-l last:rounded-r"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
        <span>1</span>
        <span>15</span>
      </div>
    </div>
  );
}

function RegionLegend({ hidden }: { hidden: readonly string[] }): ReactElement | null {
  const entries = visibleRegionEntries(hidden);
  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Grid regions
      </h3>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-1">
        {entries.map(([code, color]) => (
          <li key={code} className="flex min-w-0 items-center gap-1">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full ring-1 ring-slate-300"
              style={{ backgroundColor: color }}
            />
            <span className="truncate text-[11px] leading-none text-slate-700">{code}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MapLegend(): ReactElement {
  const [minimized, setMinimized] = useState(false);
  const layers = useMapStore((state) => state.layers);
  const hiddenAttributes = useMapStore((state) => state.hiddenAttributes);
  const showCorridors = layers['ref.corridors']?.visible ?? true;
  const showRegions = layers['ref.subregions_egrid']?.visible ?? true;
  const showBLMZones = layers['ref.blm_zones']?.visible ?? false;
  const hiddenVoltages = hiddenAttributes['ref.corridors'] ?? [];
  const hiddenRegions = hiddenAttributes['ref.subregions_egrid'] ?? [];
  const corridorCount = showCorridors ? visibleVoltageStyles(hiddenVoltages).length : 0;
  const regionCount = showRegions ? visibleRegionEntries(hiddenRegions).length : 0;

  if (minimized) {
    return (
      <button
        type="button"
        className={CHIP}
        aria-expanded={false}
        aria-label="Show legend"
        onClick={() => setMinimized(false)}
        onPointerDown={stopMapPointer}
      >
        Legend
        <ChevronUp className="size-4 text-slate-500" />
      </button>
    );
  }

  return (
    <section
      className={PANEL}
      aria-label="Map legend"
      onPointerDown={stopMapPointer}
      onWheel={stopMapPointer}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Legend</h2>
        <button
          type="button"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label="Minimize legend"
          onClick={() => setMinimized(true)}
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      <div className="grid gap-3">
        {showCorridors ? <CorridorLegend hidden={hiddenVoltages} /> : null}
        {showRegions ? <RegionLegend hidden={hiddenRegions} /> : null}
        {showBLMZones ? <BLMZoneLegend /> : null}
        {corridorCount === 0 && regionCount === 0 && !showBLMZones ? (
          <p className="text-xs text-slate-500">
            Turn on Corridors, Grid regions, or BLM Zones.
          </p>
        ) : null}
      </div>
    </section>
  );
}
