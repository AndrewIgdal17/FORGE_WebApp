import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { FeatureCollection, Geometry, Polygon } from 'geojson';
import { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import bbox from '@turf/bbox';
import { SatelliteToggle } from '@/components/map/SatelliteToggle';
import { forgeBasemapStyle } from '@/data/basemap-style';
import { useAuditPolygonDraw } from '@/hooks/use-audit-polygon-draw';

const US_CENTER: [number, number] = [-81.3412, 35.7332];
const US_ZOOM = 5;
const CORRIDOR_COLOR = '#f59e0b';
const ENDPOINT_COLOR = '#dc2626';
const SUBSTATION_FILL = '#2563eb';
const SUBSTATION_STROKE = '#1d4ed8';

const CORRIDOR_SOURCE = 'audit-corridor';
const ENDPOINT_SOURCE = 'audit-endpoint';
const SUBSTATION_SOURCE = 'audit-substation';

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export interface AuditMapProps {
  corridor: Geometry | null;
  endpoint: Geometry | null;
  substation: Geometry | null;
  fitToken: string;
  drawing: boolean;
  onDraftPolygon: (polygon: Polygon | null) => void;
}

interface AuditGeometries {
  corridor: Geometry | null;
  endpoint: Geometry | null;
  substation: Geometry | null;
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
  if (!map.getSource(CORRIDOR_SOURCE)) {
    map.addSource(CORRIDOR_SOURCE, { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('audit-corridor-line')) {
    map.addLayer({
      id: 'audit-corridor-line',
      type: 'line',
      source: CORRIDOR_SOURCE,
      paint: {
        'line-color': CORRIDOR_COLOR,
        'line-width': 4,
        'line-opacity': 0.95,
      },
    });
  }

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
  if (!map.getLayer('audit-substation-circle')) {
    map.addLayer({
      id: 'audit-substation-circle',
      type: 'circle',
      source: SUBSTATION_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 8,
        'circle-color': SUBSTATION_FILL,
        'circle-stroke-color': SUBSTATION_STROKE,
        'circle-stroke-width': 2,
      },
    });
  }

  if (!map.getSource(ENDPOINT_SOURCE)) {
    map.addSource(ENDPOINT_SOURCE, { type: 'geojson', data: emptyCollection() });
  }
  if (!map.getLayer('audit-endpoint-circle')) {
    map.addLayer({
      id: 'audit-endpoint-circle',
      type: 'circle',
      source: ENDPOINT_SOURCE,
      paint: {
        'circle-radius': 8,
        'circle-color': ENDPOINT_COLOR,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }
}

function syncAuditData(map: MapLibreMap, geometries: AuditGeometries): void {
  setGeoJson(map, CORRIDOR_SOURCE, geometries.corridor);
  setGeoJson(map, ENDPOINT_SOURCE, geometries.endpoint);
  setGeoJson(map, SUBSTATION_SOURCE, geometries.substation);
}

function fitAudit(
  map: MapLibreMap,
  corridor: Geometry | null,
  substation: Geometry | null,
  fittedKey: { current: string | null },
): void {
  if (!corridor && !substation) {
    fittedKey.current = null;
    return;
  }
  if (map.getCanvas().clientWidth === 0 || map.getCanvas().clientHeight === 0) return;

  const key = JSON.stringify([corridor, substation]);
  if (fittedKey.current === key) return;

  const features = [corridor, substation].flatMap((geometry) =>
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

export function AuditMap({
  corridor,
  endpoint,
  substation,
  fitToken,
  drawing,
  onDraftPolygon,
}: AuditMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fittedKey = useRef<string | null>(null);
  const drawZoomed = useRef(false);
  const holdView = useRef(false);
  const fitTokenRef = useRef(fitToken);
  const drawingRef = useRef(drawing);
  const geometriesRef = useRef<AuditGeometries>({ corridor, endpoint, substation });
  drawingRef.current = drawing;
  const [ready, setReady] = useState(false);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    geometriesRef.current = { corridor, endpoint, substation };
  }, [corridor, endpoint, substation]);

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
      fitAudit(map, geometriesRef.current.corridor, geometriesRef.current.substation, fittedKey);
      setReady(true);
      map.resize();
    };

    if (map.isStyleLoaded()) onStyleLoad();
    else map.on('style.load', onStyleLoad);

    const observer = new ResizeObserver(() => {
      map.resize();
      if (drawingRef.current || holdView.current) return;
      fitAudit(map, geometriesRef.current.corridor, geometriesRef.current.substation, fittedKey);
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

  const draftPolygon = useAuditPolygonDraw(ready ? map : null, drawing);

  useEffect(() => {
    onDraftPolygon(draftPolygon);
  }, [draftPolygon, onDraftPolygon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncAuditData(map, { corridor, endpoint, substation });
    if (fitTokenRef.current !== fitToken) {
      holdView.current = false;
      drawZoomed.current = false;
      fitTokenRef.current = fitToken;
    }
    if (drawing) {
      if (!drawZoomed.current) {
        const corridorKey = fittedKey.current;
        fittedKey.current = null;
        fitAudit(map, null, substation, fittedKey);
        fittedKey.current = corridorKey;
        drawZoomed.current = true;
        holdView.current = true;
      }
      return;
    }
    drawZoomed.current = false;
    if (holdView.current) return;
    fitAudit(map, corridor, substation, fittedKey);
  }, [corridor, endpoint, substation, fitToken, ready, drawing]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <SatelliteToggle map={map} preferSatellite={drawing} />
    </>
  );
}
