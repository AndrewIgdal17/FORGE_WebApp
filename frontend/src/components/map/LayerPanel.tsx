import { useId, useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Layers } from 'lucide-react';
import { MAP_OVERLAYS, PREVIEW_OVERLAYS } from '@/components/map/RouteMap';
import type { MapOverlay } from '@/components/map/RouteMap';
import { SUBREGION_COLORS, VOLTAGE_STYLES } from '@/data/color-maps';
import { useMapStore } from '@/stores/map-store';

const PANEL =
  'absolute top-4 right-4 z-10 w-80 max-h-[min(42rem,calc(100%-2rem))] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-sm';

const LAYER_DESCRIPTIONS: Record<string, string> = {
  'ref.corridors_hifld':
    'Existing high-voltage transmission lines from the Homeland Infrastructure Foundation-Level Database. Color indicates voltage class.',
  'ref.subregions_egrid':
    'EPA eGRID subregions \u2014 areas that share a common electricity generation mix.',
  'ref.blm_zones':
    'Bureau of Land Management land-value zones (1\u201315), derived from county-level appraisals. Zone 1 is the cheapest land; zone 15 is the most expensive.',
  'ref.highways_nhs': 'National Highway System routes from the Federal Highway Administration.',
  'ref.rail_narn': 'Freight and passenger rail lines from the FRA National Rail Network.',
  'ref.substations_hifld':
    'Electric power substations from the Homeland Infrastructure Foundation-Level Database.',
};

function LayerInfo({ id }: { id: string }): ReactElement | null {
  const tooltipId = useId();
  const description = LAYER_DESCRIPTIONS[id];
  if (description === undefined) return null;

  return (
    <span className="forge-tip">
      <button
        type="button"
        className="forge-tip-mark"
        aria-label="Layer information"
        aria-describedby={tooltipId}
      >
        i
      </button>
      <span id={tooltipId} className="forge-tip-panel" role="tooltip">
        {description}
      </span>
    </span>
  );
}

interface AttributeOption {
  value: string;
  label: string;
  color: string;
}

function attributeOptions(overlayId: string): readonly AttributeOption[] {
  if (overlayId === 'ref.corridors_hifld') {
    return VOLTAGE_STYLES.map((style) => ({
      value: style.voltClass,
      label: style.label,
      color: style.color,
    }));
  }
  if (overlayId === 'ref.subregions_egrid') {
    return Object.entries(SUBREGION_COLORS).map(([code, color]) => ({
      value: code,
      label: code,
      color,
    }));
  }
  return [];
}

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

function LayerSwatch({ overlay }: { overlay: MapOverlay }): ReactElement {
  if (overlay.id === 'ref.corridors_hifld') return <StackedDots colors={CORRIDOR_SWATCH} />;
  if (overlay.id === 'ref.subregions_egrid') return <StackedDots colors={REGION_SWATCH} />;
  return <span className={`size-2.5 shrink-0 rounded-sm ${overlay.swatchClass}`} />;
}

function AttributeChecklist({
  id,
  layerId,
  layerLabel,
  options,
  hidden,
}: {
  id: string;
  layerId: string;
  layerLabel: string;
  options: readonly AttributeOption[];
  hidden: readonly string[];
}): ReactElement {
  const toggleAttribute = useMapStore((state) => state.toggleAttribute);
  const setHiddenAttributes = useMapStore((state) => state.setHiddenAttributes);
  const grid = layerId === 'ref.subregions_egrid';

  return (
    <div id={id} className="col-span-2 mt-1 border-t border-slate-100 pt-1.5">
      <div className="mb-1 flex items-center justify-end gap-3">
        <button
          type="button"
          className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
          onClick={() => setHiddenAttributes(layerId, [])}
        >
          Select all
        </button>
        <button
          type="button"
          className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
          onClick={() => setHiddenAttributes(layerId, options.map((option) => option.value))}
        >
          None
        </button>
      </div>
      <ul
        className={grid ? 'grid grid-cols-3 gap-x-2 gap-y-1' : 'grid gap-1'}
        aria-label={`${layerLabel} attributes`}
      >
        {options.map((option) => (
          <li key={option.value}>
            <label className="flex min-w-0 cursor-pointer items-center gap-1 text-[11px] text-slate-700">
              <input
                type="checkbox"
                className="size-3.5 shrink-0 accent-slate-700"
                checked={!hidden.includes(option.value)}
                onChange={() => toggleAttribute(layerId, option.value)}
              />
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full ring-1 ring-slate-300"
                style={{ backgroundColor: option.color }}
              />
              <span className="truncate">{option.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverlayRow({
  overlay,
  displayOnly,
  baseId,
  expanded,
  onToggleExpanded,
}: {
  overlay: MapOverlay;
  displayOnly: boolean;
  baseId: string;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}): ReactElement {
  const layers = useMapStore((state) => state.layers);
  const hiddenAttributes = useMapStore((state) => state.hiddenAttributes);
  const toggleLayer = useMapStore((state) => state.toggleLayer);
  const setOpacity = useMapStore((state) => state.setOpacity);
  const fallback = displayOnly ? { visible: false, opacity: 0.6 } : { visible: true, opacity: 0.4 };
  const state = layers[overlay.id] ?? fallback;
  const sliderId = `${baseId}-${overlay.id}`;
  const listId = `${baseId}-${overlay.id}-attributes`;
  const percent = Math.round(state.opacity * 100);
  const options = displayOnly ? [] : attributeOptions(overlay.id);
  const open = expanded === true;

  return (
    <li className="relative z-0 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 hover:z-20 focus-within:z-20">
      <button
        type="button"
        className="rounded-md p-1 text-slate-700 hover:bg-slate-100"
        aria-pressed={state.visible}
        aria-label={`${state.visible ? 'Hide' : 'Show'} ${overlay.label}`}
        onClick={() => toggleLayer(overlay.id)}
      >
        {state.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-800">
        <LayerSwatch overlay={overlay} />
        <span className="min-w-0 flex-1 truncate">{overlay.label}</span>
        <LayerInfo id={overlay.id} />
        {displayOnly ? (
          <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[10px] font-medium tracking-wide text-slate-400 uppercase">
            Display only
          </span>
        ) : null}
        {options.length > 0 ? (
          <button
            type="button"
            className="rounded-md p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${overlay.label} filters`}
            onClick={onToggleExpanded}
          >
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : null}
        <span className="shrink-0 tabular-nums text-xs text-slate-500">{percent}%</span>
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
      {open && options.length > 0 ? (
        <AttributeChecklist
          id={listId}
          layerId={overlay.id}
          layerLabel={overlay.label}
          options={options}
          hidden={hiddenAttributes[overlay.id] ?? []}
        />
      ) : null}
    </li>
  );
}

export function LayerPanel(): ReactElement {
  const [minimized, setMinimized] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const baseId = useId();

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
    <section
      className={PANEL}
      aria-label="Map layers"
      onPointerDown={stopMapPointer}
      onWheel={stopMapPointer}
    >
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
      <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mt-3 mb-1 px-1">
        Active
      </h3>
      <ul className="grid gap-3">
        {MAP_OVERLAYS.map((overlay) => (
          <OverlayRow
            key={overlay.id}
            overlay={overlay}
            displayOnly={false}
            baseId={baseId}
            expanded={expanded[overlay.id] === true}
            onToggleExpanded={() =>
              setExpanded((current) => ({ ...current, [overlay.id]: !current[overlay.id] }))
            }
          />
        ))}
      </ul>
      <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400 mt-3 mb-1 px-1">
        Preview
      </h3>
      <ul className="grid gap-3">
        {PREVIEW_OVERLAYS.map((overlay) => (
          <OverlayRow
            key={overlay.id}
            overlay={overlay}
            displayOnly
            baseId={baseId}
          />
        ))}
      </ul>
    </section>
  );
}
