import { useId, useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers } from 'lucide-react';
import { MAP_OVERLAYS } from '@/components/map/RouteMap';
import { SUBREGION_COLORS, VOLTAGE_STYLES } from '@/data/color-maps';
import { useMapStore } from '@/stores/map-store';

const PANEL =
  'absolute top-4 right-4 z-10 w-64 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-sm';

function voltageColor(voltClass: string): string {
  return VOLTAGE_STYLES.find((style) => style.voltClass === voltClass)?.color ?? '#94a3b8';
}

const CORRIDOR_SWATCH: readonly string[] = [
  voltageColor('735 AND ABOVE'),
  voltageColor('500'),
  voltageColor('100-161'),
];

const REGION_SWATCH: readonly string[] = ['CAMX', 'ERCT', 'MROW'].map(
  (code) => SUBREGION_COLORS[code] ?? '#d9d9d9',
);

function stopMapPointer(event: SyntheticEvent): void {
  event.stopPropagation();
}

function StackedDots({ colors }: { colors: readonly string[] }): ReactElement {
  return (
    <span className="flex shrink-0 flex-col gap-0.5" aria-hidden="true">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function LayerSwatch({ overlay }: { overlay: (typeof MAP_OVERLAYS)[number] }): ReactElement {
  if (overlay.id === 'ref.corridors_hifld') return <StackedDots colors={CORRIDOR_SWATCH} />;
  if (overlay.id === 'ref.subregions_egrid') return <StackedDots colors={REGION_SWATCH} />;
  return <span className={`size-2.5 shrink-0 rounded-sm ${overlay.swatchClass}`} />;
}

export function LayerPanel(): ReactElement {
  const [minimized, setMinimized] = useState(false);
  const baseId = useId();
  const layers = useMapStore((state) => state.layers);
  const toggleLayer = useMapStore((state) => state.toggleLayer);
  const setOpacity = useMapStore((state) => state.setOpacity);

  if (minimized) {
    return (
      <button
        type="button"
        className="absolute top-4 right-4 z-10 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-sm"
        aria-expanded={false}
        aria-label="Show layers"
        onClick={() => setMinimized(false)}
        onPointerDown={stopMapPointer}
      >
        <Layers className="size-4" />
        Layers
        <ChevronUp className="size-4 text-slate-500" />
      </button>
    );
  }

  return (
    <section className={PANEL} aria-label="Map layers" onPointerDown={stopMapPointer}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Layers className="size-4" />
          Layers
        </h2>
        <button
          type="button"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label="Minimize layers"
          onClick={() => setMinimized(true)}
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      <ul className="grid gap-3">
        {MAP_OVERLAYS.map((overlay) => {
          const state = layers[overlay.id] ?? { visible: true, opacity: 0.4 };
          const sliderId = `${baseId}-${overlay.id}`;
          const percent = Math.round(state.opacity * 100);
          return (
            <li key={overlay.id} className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
              <button
                type="button"
                className="rounded-md p-1 text-slate-700 hover:bg-slate-100"
                aria-pressed={state.visible}
                aria-label={`${state.visible ? 'Hide' : 'Show'} ${overlay.label}`}
                onClick={() => toggleLayer(overlay.id)}
              >
                {state.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <span className="flex items-center gap-2 text-sm text-slate-800">
                <LayerSwatch overlay={overlay} />
                <span className="flex-1">{overlay.label}</span>
                <span className="tabular-nums text-xs text-slate-500">{percent}%</span>
              </span>
              <label className="sr-only" htmlFor={sliderId}>
                {overlay.label} opacity
              </label>
              <input
                id={sliderId}
                className="col-start-2 h-1.5 w-full accent-slate-700"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.opacity}
                aria-valuetext={`${percent}%`}
                onChange={(event) => setOpacity(overlay.id, Number(event.target.value))}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
