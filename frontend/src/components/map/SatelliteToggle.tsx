import { useEffect, useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { Map as MapIcon, Satellite } from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { setSatelliteBasemap } from '@/components/map/satellite-basemap';

const BUTTON =
  'absolute right-4 bottom-24 z-10 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-lg backdrop-blur-sm disabled:pointer-events-none disabled:opacity-50';

export interface SatelliteToggleProps {
  map: MapLibreMap | null;
}

function stopMapPointer(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function SatelliteToggle({ map }: SatelliteToggleProps): ReactElement {
  const [trackedMap, setTrackedMap] = useState(map);
  const [enabled, setEnabled] = useState(false);
  const [styleEpoch, setStyleEpoch] = useState(0);

  if (trackedMap !== map) {
    setTrackedMap(map);
    setEnabled(false);
    setStyleEpoch(0);
  }

  useEffect(() => {
    if (!map) return;
    const markReady = (): void => {
      setStyleEpoch((epoch) => epoch + 1);
    };
    map.on('style.load', markReady);
    return () => {
      map.off('style.load', markReady);
    };
  }, [map]);

  const ready = map !== null && (map.isStyleLoaded() || styleEpoch > 0);

  function toggle(): void {
    if (!map) return;
    const next = !enabled;
    if (!setSatelliteBasemap(map, next)) return;
    setEnabled(next);
  }

  const label = enabled ? 'Map' : 'Satellite';
  const Icon = enabled ? MapIcon : Satellite;

  return (
    <button
      type="button"
      className={`${BUTTON} ${
        enabled
          ? 'border-slate-800 bg-slate-900/90 text-white hover:bg-slate-900'
          : 'border-slate-200 bg-white/90 text-slate-800 hover:bg-white'
      }`}
      aria-pressed={enabled}
      aria-label={enabled ? 'Show map' : 'Show satellite imagery'}
      title={label}
      disabled={!ready}
      onClick={toggle}
      onPointerDown={stopMapPointer}
      onDoubleClick={stopMapPointer}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
