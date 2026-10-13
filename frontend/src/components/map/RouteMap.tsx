import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import bbox from '@turf/bbox';
import { forgeBasemapStyle } from '@/data/basemap-style';
import { useMapStore } from '@/stores/map-store';

const TILE_ORIGIN = 'https://tiles.forge-calc.com';
const US_CENTER: [number, number] = [-98.5, 39.8];
const US_ZOOM = 4;
const ROUTE_BLUE = '#3b82f6';
const ROUTE_WHITE = '#ffffff';
const ROUTE_SOURCE_ID = 'forge-existing-route';

export interface MapOverlay {
  id: 'ref.counties_tiger' | 'ref.corridors_hifld' | 'ref.subregions_egrid';
  label: string;
  swatchClass: string;
  kind: 'fill' | 'line';
  color: string;
}

export const MAP_OVERLAYS: readonly MapOverlay[] = [
  {
    id: 'ref.counties_tiger',
    label: 'Counties',
    swatchClass: 'bg-slate-400',
    kind: 'fill',
    color: '#94a3b8',
  },
  {
    id: 'ref.corridors_hifld',
    label: 'Corridors',
    swatchClass: 'bg-orange-500',
    kind: 'line',
    color: '#f97316',
  },
  {
    id: 'ref.subregions_egrid',
    label: 'Grid regions',
    swatchClass: 'bg-teal-500',
    kind: 'fill',
    color: '#14b8a6',
  },
];

const EMPTY_ROUTE: FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface RouteMapProps {
  onMap: (map: MapLibreMap | null) => void;
  existingRoute?: MultiLineString | null;
}

function routeCollection(route: MultiLineString): FeatureCollection<LineString | Point> {
  const features: Array<Feature<LineString | Point>> = [];
  for (const coordinates of route.coordinates) {
    if (coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    });
    for (const position of coordinates) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: position },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function addOverlays(map: MapLibreMap): void {
  const layers = useMapStore.getState().layers;
  for (const overlay of MAP_OVERLAYS) {
    if (!map.getSource(overlay.id)) {
      map.addSource(overlay.id, {
        type: 'vector',
        url: `${TILE_ORIGIN}/${overlay.id}`,
      });
    }
    if (map.getLayer(overlay.id)) continue;
    const state = layers[overlay.id];
    const visibility = state?.visible === false ? 'none' : 'visible';
    if (overlay.kind === 'fill') {
      map.addLayer({
        id: overlay.id,
        type: 'fill',
        source: overlay.id,
        'source-layer': overlay.id,
        layout: { visibility },
        paint: {
          'fill-color': overlay.color,
          'fill-opacity': state?.opacity ?? 0.4,
        },
      });
      continue;
    }
    map.addLayer({
      id: overlay.id,
      type: 'line',
      source: overlay.id,
      'source-layer': overlay.id,
      layout: { visibility },
      paint: {
        'line-color': overlay.color,
        'line-width': 2,
        'line-opacity': state?.opacity ?? 0.7,
        'line-dasharray': [4, 2],
      },
    });
  }
}

function addRouteLayers(map: MapLibreMap): void {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_ROUTE,
    });
  }
  if (!map.getLayer('forge-existing-route-casing')) {
    map.addLayer({
      id: 'forge-existing-route-casing',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ROUTE_WHITE,
        'line-width': 1,
        'line-gap-width': 3,
      },
    });
  }
  if (!map.getLayer('forge-existing-route-line')) {
    map.addLayer({
      id: 'forge-existing-route-line',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ROUTE_BLUE,
        'line-width': 3,
      },
    });
  }
  if (!map.getLayer('forge-existing-route-points')) {
    map.addLayer({
      id: 'forge-existing-route-points',
      type: 'circle',
      source: ROUTE_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 4,
        'circle-color': ROUTE_WHITE,
        'circle-stroke-color': ROUTE_BLUE,
        'circle-stroke-width': 2,
      },
    });
  }
}

function syncRouteData(map: MapLibreMap, route: MultiLineString | null): void {
  const source = map.getSource(ROUTE_SOURCE_ID);
  if (!(source instanceof GeoJSONSource)) return;
  source.setData(route ? routeCollection(route) : EMPTY_ROUTE);
}

function fitToRoute(map: MapLibreMap, route: MultiLineString): void {
  const feature: Feature<MultiLineString> = {
    type: 'Feature',
    properties: {},
    geometry: route,
  };
  const bounds = bbox(feature);
  const west = bounds[0];
  const south = bounds[1];
  const east = bounds[2];
  const north = bounds[3];
  if (![west, south, east, north].every((value) => Number.isFinite(value))) return;
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: { top: 72, right: 288, bottom: 72, left: 312 },
      maxZoom: 10,
      duration: 0,
    },
  );
}

function fitExisting(
  map: MapLibreMap,
  route: MultiLineString | null,
  fittedKey: { current: string | null },
): void {
  if (!route || map.getCanvas().clientWidth === 0 || map.getCanvas().clientHeight === 0) return;
  const key = JSON.stringify(route.coordinates);
  if (fittedKey.current === key) return;
  fittedKey.current = key;
  fitToRoute(map, route);
}

function applyLayerState(map: MapLibreMap): void {
  const layers = useMapStore.getState().layers;
  for (const overlay of MAP_OVERLAYS) {
    if (!map.getLayer(overlay.id)) continue;
    const state = layers[overlay.id];
    if (!state) continue;
    map.setLayoutProperty(overlay.id, 'visibility', state.visible ? 'visible' : 'none');
    if (overlay.kind === 'fill') {
      map.setPaintProperty(overlay.id, 'fill-opacity', state.opacity);
    } else {
      map.setPaintProperty(overlay.id, 'line-opacity', state.opacity);
    }
  }
}

export function RouteMap({ onMap, existingRoute = null }: RouteMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onMapRef = useRef(onMap);
  const fittedKey = useRef<string | null>(null);
  const existingRouteRef = useRef(existingRoute);
  const [ready, setReady] = useState(false);
  const layers = useMapStore((state) => state.layers);
  onMapRef.current = onMap;
  existingRouteRef.current = existingRoute;

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
    onMapRef.current(map);

    const onStyleLoad = (): void => {
      if (cancelled) return;
      addOverlays(map);
      addRouteLayers(map);
      applyLayerState(map);
      setReady(true);
      map.resize();
    };

    if (map.isStyleLoaded()) onStyleLoad();
    else map.on('style.load', onStyleLoad);

    const observer = new ResizeObserver(() => {
      map.resize();
      fitExisting(map, existingRouteRef.current, fittedKey);
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      map.off('style.load', onStyleLoad);
      map.remove();
      mapRef.current = null;
      fittedKey.current = null;
      setReady(false);
      onMapRef.current(null);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyLayerState(map);
  }, [layers, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncRouteData(map, existingRoute);
    if (!existingRoute) {
      fittedKey.current = null;
      return;
    }
    fitExisting(map, existingRoute, fittedKey);
  }, [existingRoute, ready]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full [&_.maplibregl-ctrl-bottom-right]:bottom-16"
    />
  );
}
