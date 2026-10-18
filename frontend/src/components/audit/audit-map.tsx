import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import bbox from '@turf/bbox';
import { SatelliteToggle } from '@/components/map/SatelliteToggle';
import { forgeBasemapStyle } from '@/data/basemap-style';

const US_CENTER: [number, number] = [-81.3412, 35.7332];
const US_ZOOM = 5;
const HIFLD_COLOR = '#dc2626';
const SUBSTATION_FILL = '#2563eb';
const SUBSTATION_STROKE = '#1d4ed8';

const HIFLD_SOURCE = 'audit-hifld';
const SUBSTATION_SOURCE = 'audit-substation';

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export interface AuditMapProps {
  hifld: Geometry | null;
  osm: Geometry | null;
  fitToken: string;
}

interface AuditGeometries {
  hifld: Geometry | null;
  osm: Geometry | null;
}

function featureCollection(geometry: Geometry | null): FeatureCollection {
  if (!geometry) return emptyCollection();
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry }],
  };
}

function setGeoJson(map: MapLibreMap, sourceId: string, geometry: Geometry | null): void {
  const source = map.getSource(sourceId);
  if (!(source instanceof GeoJSONSource)) return;
  source.setData(featureCollection(geometry));
}

function addAuditLayers(map: MapLibreMap): void {
  if (!map.getSource(SUBSTATION_SOURCE)) {
    map.addSource(SUBSTATION_SOURCE, { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('audit-substation-fill')) {
    map.addLayer({
      id: 'audit-substation-fill',
      type: 'fill',
      source: SUBSTATION_SOURCE,
      paint: {
        'fill-color': SUBSTATION_FILL,
        'fill-opacity': 0.35,
      },
    });
  }
  if (!map.getLayer('audit-substation-outline')) {
    map.addLayer({
      id: 'audit-substation-outline',
      type: 'line',
      source: SUBSTATION_SOURCE,
      paint: {
        'line-color': SUBSTATION_STROKE,
        'line-width': 2,
      },
    });
  }

  if (!map.getSource(HIFLD_SOURCE)) {
    map.addSource(HIFLD_SOURCE, { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('audit-hifld-circle')) {
    map.addLayer({
      id: 'audit-hifld-circle',
      type: 'circle',
      source: HIFLD_SOURCE,
      paint: {
        'circle-radius': 6,
        'circle-color': HIFLD_COLOR,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }
}

function syncAuditData(map: MapLibreMap, geometries: AuditGeometries): void {
  setGeoJson(map, HIFLD_SOURCE, geometries.hifld);
  setGeoJson(map, SUBSTATION_SOURCE, geometries.osm);
}

function fitAudit(
  map: MapLibreMap,
  hifld: Geometry | null,
  osm: Geometry | null,
  fittedKey: { current: string | null },
): void {
  if (!hifld && !osm) {
    fittedKey.current = null;
    return;
  }
  if (map.getCanvas().clientWidth === 0 || map.getCanvas().clientHeight === 0) return;

  const key = JSON.stringify([hifld, osm]);
  if (fittedKey.current === key) return;

  const features = [hifld, osm].flatMap((geometry) =>
    geometry ? [{ type: 'Feature' as const, properties: {}, geometry }] : [],
  );
  if (features.length === 0) return;
  const collection: FeatureCollection = { type: 'FeatureCollection', features };

  let west: number;
  let south: number;
  let east: number;
  let north: number;
  try {
    const bounds = bbox(collection);
    west = bounds[0];
    south = bounds[1];
    east = bounds[2];
    north = bounds[3];
  } catch {
    return;
  }
  if (![west, south, east, north].every((value) => Number.isFinite(value))) return;

  if (east - west < 0.002) {
    const mid = (east + west) / 2;
    west = mid - 0.002;
    east = mid + 0.002;
  }
  if (north - south < 0.002) {
    const mid = (north + south) / 2;
    south = mid - 0.002;
    north = mid + 0.002;
  }

  fittedKey.current = key;
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 56, maxZoom: 16, duration: 0 },
  );
}

export function AuditMap({ hifld, osm, fitToken }: AuditMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fittedKey = useRef<string | null>(null);
  const fitTokenRef = useRef(fitToken);
  const geometriesRef = useRef<AuditGeometries>({ hifld, osm });
  const [ready, setReady] = useState(false);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    geometriesRef.current = { hifld, osm };
  }, [hifld, osm]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const map = new MapLibreMap({
      container,
      style: forgeBasemapStyle(),
      center: US_CENTER,
      zoom: US_ZOOM,
    });
    mapRef.current = map;
    setMap(map);

    const onStyleLoad = (): void => {
      if (cancelled) return;
      addAuditLayers(map);
      syncAuditData(map, geometriesRef.current);
      fitAudit(map, geometriesRef.current.hifld, geometriesRef.current.osm, fittedKey);
      setReady(true);
      map.resize();
    };

    if (map.isStyleLoaded()) onStyleLoad();
    else map.on('style.load', onStyleLoad);

    const observer = new ResizeObserver(() => {
      map.resize();
      fitAudit(map, geometriesRef.current.hifld, geometriesRef.current.osm, fittedKey);
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      map.off('style.load', onStyleLoad);
      map.remove();
      mapRef.current = null;
      fittedKey.current = null;
      setMap(null);
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncAuditData(map, { hifld, osm });
    if (fitTokenRef.current !== fitToken) {
      fittedKey.current = null;
      fitTokenRef.current = fitToken;
    }
    fitAudit(map, hifld, osm, fittedKey);
  }, [hifld, osm, fitToken, ready]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <SatelliteToggle map={map} preferSatellite />
    </>
  );
}
