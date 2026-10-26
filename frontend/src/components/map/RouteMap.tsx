import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import bbox from '@turf/bbox';
import { forgeBasemapStyle } from '@/data/basemap-style';
import {
  SUBREGION_FILL_EXPRESSION,
  VOLTAGE_COLOR_EXPRESSION,
  VOLTAGE_WIDTH_EXPRESSION,
} from '@/data/color-maps';
import { useMapStore } from '@/stores/map-store';

const TILE_ORIGIN = 'https://tiles.forge-calc.com';
const US_CENTER: [number, number] = [-81.3412, 35.7332]; // Hickory, NC
const US_ZOOM = 5;
const ROUTE_BLUE = '#3b82f6';
const ROUTE_WHITE = '#ffffff';
const ROUTE_SOURCE_ID = 'forge-existing-route';

/** Data-driven fill: warm sequential palette for BLM zones 1–15. */
const BLM_ZONE_FILL: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'zone'],
  1, '#fef3c7',   // lightest (cheapest land)
  3, '#fde68a',
  5, '#fbbf24',
  7, '#f59e0b',
  9, '#d97706',
  11, '#b45309',
  13, '#92400e',
  15, '#78350f',  // darkest (most expensive land)
];

export interface MapOverlay {
  id:
    | 'ref.corridors'
    | 'ref.subregions_egrid'
    | 'ref.highways_nhs'
    | 'ref.rail_narn'
    | 'ref.substations_display'
    | 'ref.blm_zones';
  label: string;
  swatchClass: string;
  kind: 'fill' | 'line' | 'circle';
  /** Representative swatch. Grid and corridor paint is data-driven. */
  color: string;
  borderColor?: string;
  borderWidth?: number;
}

export const MAP_OVERLAYS: readonly MapOverlay[] = [
  {
    id: 'ref.corridors',
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
    borderColor: '#64748b',
    borderWidth: 1,
  },
  {
    id: 'ref.blm_zones',
    label: 'BLM Zones',
    swatchClass: 'bg-amber-400',
    kind: 'fill',
    color: '#fbbf24',
    borderColor: '#92400e',
    borderWidth: 0.5,
  },
];

/** Display-only reference layers. Not registered for hover or click. */
export const PREVIEW_OVERLAYS: readonly MapOverlay[] = [
  {
    id: 'ref.highways_nhs',
    label: 'Highways (NHS)',
    swatchClass: 'bg-blue-500',
    kind: 'line',
    color: '#3b82f6',
  },
  {
    id: 'ref.rail_narn',
    label: 'Rail Network (FRA)',
    swatchClass: 'bg-amber-700',
    kind: 'line',
    color: '#b45309',
  },
  {
    id: 'ref.substations_display',
    label: 'Substations',
    swatchClass: 'bg-rose-500',
    kind: 'circle',
    color: '#f43f5e',
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

function paintExpression(expression: readonly unknown[]): ExpressionSpecification {
  return expression as unknown as ExpressionSpecification;
}

function fillOpacityExpression(opacity: number): ExpressionSpecification {
  return paintExpression([
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    Math.min(opacity + 0.2, 0.8),
    opacity,
  ]);
}

function borderLayerId(overlayId: MapOverlay['id']): string {
  return `${overlayId}-border`;
}

export function hitLayerId(overlayId: string): string {
  return `${overlayId}-hit`;
}

export function baseLayerId(id: string): string {
  return id.endsWith('-hit') ? id.slice(0, -4) : id;
}

const HIT_TARGET_IDS = new Set<string>([
  'ref.corridors',
  'ref.highways_nhs',
  'ref.rail_narn',
  'ref.substations_display',
]);

const HIT_WIDTH_EXPRESSION = [
  'interpolate', ['linear'], ['zoom'],
  5, 6,
  8, 10,
  12, 14,
];

function addHitLayer(map: MapLibreMap, overlayId: string, visibility: 'visible' | 'none'): void {
  const id = hitLayerId(overlayId);
  if (map.getLayer(id)) return;
  map.addLayer(
    {
      id,
      type: 'line',
      source: overlayId,
      'source-layer': overlayId,
      layout: { visibility },
      paint: {
        'line-color': '#000',
        'line-opacity': 0,
        'line-width': HIT_WIDTH_EXPRESSION as unknown as number,
      },
    },
    overlayId,
  );
}

/** Wider invisible circle. The painted substation dots are only 2–5px. */
function addCircleHitLayer(
  map: MapLibreMap,
  overlayId: string,
  visibility: 'visible' | 'none',
): void {
  const id = hitLayerId(overlayId);
  if (map.getLayer(id)) return;
  map.addLayer(
    {
      id,
      type: 'circle',
      source: overlayId,
      'source-layer': overlayId,
      layout: { visibility },
      paint: {
        'circle-radius': 10,
        'circle-color': '#000',
        'circle-opacity': 0,
      },
    },
    overlayId,
  );
}

function addOverlays(map: MapLibreMap): void {
  const layers = useMapStore.getState().layers;
  for (const overlay of MAP_OVERLAYS) {
    if (!map.getSource(overlay.id)) {
      map.addSource(overlay.id, {
        type: 'vector',
        url: `${TILE_ORIGIN}/${overlay.id}`,
        promoteId: 'gid',
      });
    }
    const state = layers[overlay.id];
    const visibility = state?.visible === false ? 'none' : 'visible';
    if (!map.getLayer(overlay.id)) {
      if (overlay.id === 'ref.subregions_egrid') {
        map.addLayer({
          id: overlay.id,
          type: 'fill',
          source: overlay.id,
          'source-layer': overlay.id,
          layout: { visibility },
          paint: {
            'fill-color': paintExpression(SUBREGION_FILL_EXPRESSION),
            'fill-opacity': fillOpacityExpression(state?.opacity ?? 0.4),
          },
        });
      } else if (overlay.id === 'ref.corridors') {
        map.addLayer({
          id: overlay.id,
          type: 'line',
          source: overlay.id,
          'source-layer': overlay.id,
          layout: { visibility },
          paint: {
            'line-color': paintExpression(VOLTAGE_COLOR_EXPRESSION),
            'line-width': paintExpression(VOLTAGE_WIDTH_EXPRESSION),
            'line-opacity': state?.opacity ?? 0.7,
          },
        });
      } else if (overlay.id === 'ref.blm_zones') {
        map.addLayer({
          id: overlay.id,
          type: 'fill',
          source: overlay.id,
          'source-layer': overlay.id,
          layout: { visibility },
          paint: {
            'fill-color': paintExpression(BLM_ZONE_FILL),
            'fill-opacity': fillOpacityExpression(state?.opacity ?? 0.6),
          },
        });
      } else {
        map.addLayer({
          id: overlay.id,
          type: 'fill',
          source: overlay.id,
          'source-layer': overlay.id,
          layout: { visibility },
          paint: {
            'fill-color': overlay.color,
            'fill-opacity': fillOpacityExpression(state?.opacity ?? 0.4),
          },
        });
      }
    }
    if (HIT_TARGET_IDS.has(overlay.id)) {
      addHitLayer(map, overlay.id, visibility);
    }
    if (overlay.borderColor === undefined || map.getLayer(borderLayerId(overlay.id))) continue;
    map.addLayer({
      id: borderLayerId(overlay.id),
      type: 'line',
      source: overlay.id,
      'source-layer': overlay.id,
      layout: { visibility },
      paint: {
        'line-color': overlay.borderColor,
        'line-width': overlay.borderWidth ?? 1,
        'line-opacity': state?.opacity ?? 0.4,
      },
    });
  }
  for (const overlay of PREVIEW_OVERLAYS) {
    if (!map.getSource(overlay.id)) {
      map.addSource(overlay.id, {
        type: 'vector',
        url: `${TILE_ORIGIN}/${overlay.id}`,
        promoteId: 'gid',
      });
    }
    const state = layers[overlay.id];
    const visibility = state?.visible === false ? 'none' : 'visible';
    if (map.getLayer(overlay.id)) continue;
    if (overlay.kind === 'circle') {
      map.addLayer({
        id: overlay.id,
        type: 'circle',
        source: overlay.id,
        'source-layer': overlay.id,
        layout: { visibility },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2, 8, 3, 12, 5],
          'circle-color': overlay.color,
          'circle-opacity': state?.opacity ?? 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });
      if (HIT_TARGET_IDS.has(overlay.id)) {
        addCircleHitLayer(map, overlay.id, visibility);
      }
    } else if (overlay.kind === 'fill') {
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
      if (overlay.borderColor) {
        map.addLayer({
          id: borderLayerId(overlay.id),
          type: 'line',
          source: overlay.id,
          'source-layer': overlay.id,
          layout: { visibility },
          paint: {
            'line-color': overlay.borderColor,
            'line-width': overlay.borderWidth ?? 0.5,
            'line-opacity': state?.opacity ?? 0.4,
          },
        });
      }
    } else {
      const linePaint = {
        'line-color': overlay.color,
        'line-width': 1,
        'line-opacity': state?.opacity ?? 0.6,
      };
      map.addLayer({
        id: overlay.id,
        type: 'line',
        source: overlay.id,
        'source-layer': overlay.id,
        layout: { visibility },
        paint:
          overlay.id === 'ref.highways_nhs'
            ? { ...linePaint, 'line-dasharray': [6, 3] }
            : linePaint,
      });
      if (HIT_TARGET_IDS.has(overlay.id)) {
        addHitLayer(map, overlay.id, visibility);
      }
    }
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

function exclusionFilter(
  property: string,
  hidden: readonly string[],
): ExpressionSpecification | null {
  if (hidden.length === 0) return null;
  return paintExpression(['!', ['in', ['get', property], ['literal', [...hidden]]]]);
}

function setLayerFilter(
  map: MapLibreMap,
  layerId: string,
  filter: ExpressionSpecification | null,
): void {
  if (!map.getLayer(layerId)) return;
  map.setFilter(layerId, filter);
}

function applyAttributeFilters(map: MapLibreMap): void {
  const hidden = useMapStore.getState().hiddenAttributes;

  const corridorId = 'ref.corridors' as const;
  const corridorFilter = exclusionFilter('volt_class', hidden[corridorId] ?? []);
  setLayerFilter(map, corridorId, corridorFilter);
  setLayerFilter(map, hitLayerId(corridorId), corridorFilter);

  const regionId = 'ref.subregions_egrid' as const;
  const regionFilter = exclusionFilter('subregion', hidden[regionId] ?? []);
  setLayerFilter(map, regionId, regionFilter);
  setLayerFilter(map, borderLayerId(regionId), regionFilter);
}

function applyLayerState(map: MapLibreMap): void {
  const layers = useMapStore.getState().layers;
  for (const overlay of [...MAP_OVERLAYS, ...PREVIEW_OVERLAYS]) {
    const state = layers[overlay.id];
    if (!state) continue;
    const visibility = state.visible ? 'visible' : 'none';
    if (map.getLayer(overlay.id)) {
      map.setLayoutProperty(overlay.id, 'visibility', visibility);
      if (overlay.kind === 'fill') {
        map.setPaintProperty(overlay.id, 'fill-opacity', fillOpacityExpression(state.opacity));
      } else if (overlay.kind === 'circle') {
        map.setPaintProperty(overlay.id, 'circle-opacity', state.opacity);
      } else {
        map.setPaintProperty(overlay.id, 'line-opacity', state.opacity);
      }
    }
    const borderId = borderLayerId(overlay.id);
    if (map.getLayer(borderId)) {
      map.setLayoutProperty(borderId, 'visibility', visibility);
      map.setPaintProperty(borderId, 'line-opacity', state.opacity);
    }
    const hitId = hitLayerId(overlay.id);
    if (map.getLayer(hitId)) {
      map.setLayoutProperty(hitId, 'visibility', visibility);
    }
  }
  applyAttributeFilters(map);
}

export function RouteMap({ onMap, existingRoute = null }: RouteMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onMapRef = useRef(onMap);
  const fittedKey = useRef<string | null>(null);
  const existingRouteRef = useRef(existingRoute);
  const [ready, setReady] = useState(false);
  const layers = useMapStore((state) => state.layers);
  const hiddenAttributes = useMapStore((state) => state.hiddenAttributes);
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
  }, [layers, hiddenAttributes, ready]);

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
