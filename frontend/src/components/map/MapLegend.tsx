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

function CorridorLegend(): ReactElement {
  const rows = VOLTAGE_STYLES.filter((style) => {
    const voltClass = style.voltClass.trim();
    return voltClass.length > 0 && voltClass !== 'NOT AVAILABLE';
  });

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

function RegionLegend(): ReactElement {
  const entries = Object.entries(SUBREGION_COLORS);

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
  const showCorridors = layers['ref.corridors_hifld']?.visible ?? true;
  const showRegions = layers['ref.subregions_egrid']?.visible ?? true;

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
        {showCorridors ? <CorridorLegend /> : null}
        {showRegions ? <RegionLegend /> : null}
        {!showCorridors && !showRegions ? (
          <p className="text-xs text-slate-500">Turn on Corridors or Grid regions.</p>
        ) : null}
      </div>
    </section>
  );
}
