import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from 'geojson';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { GeoJSONSource, Map as MapLibreMap, VectorTileSource } from 'maplibre-gl';
import bbox from '@turf/bbox';
import { getNercRegions } from '@/lib/api';
import { forgeBasemapStyle } from '@/data/basemap-style';
import {
  SUBREGION_FILL_EXPRESSION,
  VOLTAGE_COLOR_EXPRESSION,
  VOLTAGE_WIDTH_EXPRESSION,
} from '@/data/color-maps';
import {
  REGION_FILTERED_LAYERS,
  TILE_ORIGIN,
  heavySourceSpec,
  type HeavySourceSpec,
  paddedBounds,
  regionMaskGeometry,
  regionTileUrl,
  tickedBounds,
} from '@/lib/region-tiles';
import { solidRouteGeometry, type RouteConnectorSegment } from '@/lib/route-display';
import { regionLabelPoints, regionShapes, sortRegions, type RegionShape } from '@/lib/regions';
import { useMapStore } from '@/stores/map-store';

const US_CENTER: [number, number] = [-81.3412, 35.7332]; // Hickory, NC
const US_ZOOM = 5;
const ROUTE_BLUE = '#3b82f6';
const ROUTE_WHITE = '#ffffff';
const ROUTE_SOURCE_ID = 'forge-existing-route';
const CONNECTOR_SOURCE_ID = 'forge-route-connectors';
const CONNECTOR_LAYER_ID = 'forge-route-connectors-line';

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
    | 'ref.blm_zones'
    | 'ref.nerc_regions'
    | 'ref.interconnections';
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

/**
 * Reference shapes, shown only in a project (see LayerPanel showReference).
 * NERC regions also draw their codes as labels (NERC_LABEL_LAYER_ID).
 */
export const REFERENCE_OVERLAYS: readonly MapOverlay[] = [
  {
    id: 'ref.nerc_regions',
    label: 'NERC regions',
    swatchClass: 'bg-violet-500',
    kind: 'line',
    color: '#7c3aed',
  },
  {
    id: 'ref.interconnections',
    label: 'Interconnections',
    swatchClass: 'bg-sky-600',
    kind: 'line',
    color: '#0369a1',
  },
];

const NERC_LABEL_LAYER_ID = 'ref.nerc_regions-label';
/** One point per region (see regionLabelPoints); tile labels repeated per tile. */
const NERC_LABEL_SOURCE_ID = 'forge-nerc-region-labels';
const MASK_SOURCE_ID = 'forge-region-mask';
const MASK_LAYER_ID = 'forge-region-mask-fill';
const OUTLINE_SOURCE_ID = 'forge-region-outline';
const OUTLINE_LAYER_ID = 'forge-region-outline-line';
const ROUTE_CASING_LAYER_ID = 'forge-existing-route-casing';

const EMPTY_ROUTE: FeatureCollection = { type: 'FeatureCollection', features: [] };

export type { RouteConnectorSegment };

export interface RouteMapProps {
  onMap: (map: MapLibreMap | null) => void;
  existingRoute?: MultiLineString | null;
  connectorSegments?: readonly RouteConnectorSegment[];
  /** NERC regions of the project or draft. Null or empty: no region filter. */
  regions?: readonly string[] | null;
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
      minzoom: 11,
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

function isRegionFiltered(layerId: string): boolean {
  return (REGION_FILTERED_LAYERS as readonly string[]).includes(layerId);
}

/** Heavy layers use the region-aware spec (see heavySourceSpec); others keep TileJSON. */
function addVectorSource(map: MapLibreMap, layerId: string, regions: readonly string[]): void {
  if (map.getSource(layerId)) return;
  if (isRegionFiltered(layerId)) {
    map.addSource(layerId, heavySourceSpec(layerId, regions));
    return;
  }
  map.addSource(layerId, {
    type: 'vector',
    url: `${TILE_ORIGIN}/${layerId}`,
    promoteId: 'gid',
  });
}

function addOverlays(map: MapLibreMap, regions: readonly string[]): void {
  const layers = useMapStore.getState().layers;
  for (const overlay of MAP_OVERLAYS) {
    addVectorSource(map, overlay.id, regions);
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
    addVectorSource(map, overlay.id, regions);
    const state = layers[overlay.id];
    const visibility = state?.visible === false ? 'none' : 'visible';
    if (map.getLayer(overlay.id)) continue;
    if (overlay.kind === 'circle') {
      map.addLayer({
        id: overlay.id,
        type: 'circle',
        source: overlay.id,
        'source-layer': overlay.id,
        minzoom: 11,
        layout: { visibility },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 13, 4, 15, 6],
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

/** Route layers stay on top, so reference and outline layers go beneath them. */
function beforeRouteId(map: MapLibreMap): string | undefined {
  return map.getLayer(ROUTE_CASING_LAYER_ID) ? ROUTE_CASING_LAYER_ID : undefined;
}

function removeLayerAndSource(map: MapLibreMap, layerId: string, sourceId: string): void {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function setGeoJsonData(
  map: MapLibreMap,
  sourceId: string,
  data: FeatureCollection | Feature,
): void {
  const source = map.getSource(sourceId);
  if (source instanceof GeoJSONSource) {
    source.setData(data as FeatureCollection);
    return;
  }
  map.addSource(sourceId, { type: 'geojson', data: data as FeatureCollection });
}

/**
 * Re-creates a source with a new spec, keeping its layers (ids, paint, layout,
 * filters, z-order). Layers go first: a source cannot be removed while one uses it.
 */
function rebuildSource(map: MapLibreMap, sourceId: string, spec: HeavySourceSpec): void {
  const all = map.getStyle().layers;
  const dependents = all.filter((layer) => 'source' in layer && layer.source === sourceId);
  const dependentIds = new Set(dependents.map((layer) => layer.id));
  const beforeIds = dependents.map((layer) => {
    const start = all.findIndex((candidate) => candidate.id === layer.id);
    return all.slice(start + 1).find((candidate) => !dependentIds.has(candidate.id))?.id;
  });
  for (const layer of dependents) map.removeLayer(layer.id);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
  map.addSource(sourceId, spec);
  dependents.forEach((layer, index) => map.addLayer(layer, beforeIds[index]));
}

/**
 * Moves a corridor-style source from one region set to another. Between none
 * and some the source kind changes (TileJSON url or tiles template), so it is
 * rebuilt; between two sets setTiles swaps the address. `layerId` is the table
 * the tiles come from (the source id may differ, as for the line highlight).
 */
export function swapRegionSource(
  map: MapLibreMap,
  sourceId: string,
  layerId: string,
  regions: readonly string[],
  previous: readonly string[],
): void {
  if (regions.length === 0 && previous.length === 0) return;
  if (regions.length === 0 || previous.length === 0) {
    rebuildSource(map, sourceId, heavySourceSpec(layerId, regions));
    return;
  }
  const source = map.getSource(sourceId);
  if (source instanceof VectorTileSource) source.setTiles([regionTileUrl(layerId, regions)]);
}

function applyRegionTiles(
  map: MapLibreMap,
  regions: readonly string[],
  previous: readonly string[],
): void {
  for (const layerId of REGION_FILTERED_LAYERS) {
    swapRegionSource(map, layerId, layerId, regions, previous);
  }
}

/** Grey mask outside the ticked regions, their outlines, and the pan limit. */
function applyRegionShapes(
  map: MapLibreMap,
  regions: readonly string[],
  shapes: readonly RegionShape[] | null,
): void {
  if (shapes) setGeoJsonData(map, NERC_LABEL_SOURCE_ID, regionLabelPoints(shapes));
  if (regions.length === 0 || !shapes) {
    removeLayerAndSource(map, MASK_LAYER_ID, MASK_SOURCE_ID);
    removeLayerAndSource(map, OUTLINE_LAYER_ID, OUTLINE_SOURCE_ID);
    map.setMaxBounds(null);
    return;
  }

  setGeoJsonData(map, MASK_SOURCE_ID, regionMaskGeometry(shapes, regions));
  if (!map.getLayer(MASK_LAYER_ID)) {
    map.addLayer(
      {
        id: MASK_LAYER_ID,
        type: 'fill',
        source: MASK_SOURCE_ID,
        paint: { 'fill-color': '#6b7280', 'fill-opacity': 0.45 },
      },
      map.getLayer('ref.corridors') ? 'ref.corridors' : undefined,
    );
  }

  const ticked: Array<Feature<Polygon | MultiPolygon>> = shapes
    .filter((shape) => regions.includes(shape.code))
    .map((shape) => ({
      type: 'Feature',
      properties: { code: shape.code },
      geometry: shape.geometry,
    }));
  setGeoJsonData(map, OUTLINE_SOURCE_ID, { type: 'FeatureCollection', features: ticked });
  if (!map.getLayer(OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: OUTLINE_LAYER_ID,
      type: 'line',
      source: OUTLINE_SOURCE_ID,
      paint: { 'line-color': '#334155', 'line-width': 1.5, 'line-opacity': 0.8 },
    }, beforeRouteId(map));
  }

  const bounds = tickedBounds(shapes, regions);
  if (bounds) {
    const [west, south, east, north] = paddedBounds(bounds);
    map.setMaxBounds([
      [west, south],
      [east, north],
    ]);
  } else {
    map.setMaxBounds(null);
  }
}

/** Adds the reference layers when a project is shown; removes them otherwise. */
function applyReferenceLayers(map: MapLibreMap, show: boolean): void {
  if (!show) {
    // Layers first: a source cannot be removed while a layer still uses it.
    for (const layerId of [NERC_LABEL_LAYER_ID, ...REFERENCE_OVERLAYS.map((o) => o.id)]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const overlay of REFERENCE_OVERLAYS) {
      if (map.getSource(overlay.id)) map.removeSource(overlay.id);
    }
    return;
  }
  for (const overlay of REFERENCE_OVERLAYS) {
    if (!map.getSource(overlay.id)) {
      map.addSource(overlay.id, {
        type: 'vector',
        url: `${TILE_ORIGIN}/${overlay.id}`,
        promoteId: 'gid',
      });
    }
    if (!map.getLayer(overlay.id)) {
      map.addLayer(
        {
          id: overlay.id,
          type: 'line',
          source: overlay.id,
          'source-layer': overlay.id,
          paint: {
            'line-color': overlay.color,
            'line-width': 1.5,
            'line-opacity': 0.8,
          },
        },
        beforeRouteId(map),
      );
    }
  }
  if (!map.getSource(NERC_LABEL_SOURCE_ID)) {
    map.addSource(NERC_LABEL_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(NERC_LABEL_LAYER_ID)) {
    map.addLayer(
      {
      id: NERC_LABEL_LAYER_ID,
      type: 'symbol',
      source: NERC_LABEL_SOURCE_ID,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#4c1d95',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
      },
      beforeRouteId(map),
    );
  }
}

/**
 * Brings the region state to the map: tiles (only when the key changed),
 * mask and pan limit, reference layers, then layer visibility.
 */
function syncRegions(
  map: MapLibreMap,
  regions: readonly string[],
  shapes: readonly RegionShape[] | null,
  appliedKey: { current: string },
): void {
  const key = regions.join(',');
  if (appliedKey.current !== key) {
    applyRegionTiles(map, regions, appliedKey.current ? appliedKey.current.split(',') : []);
    appliedKey.current = key;
  }
  applyRegionShapes(map, regions, shapes);
  applyReferenceLayers(map, regions.length > 0);
  applyLayerState(map);
}

function connectorCollection(
  segments: readonly RouteConnectorSegment[],
): FeatureCollection<LineString> {
  const features: Array<Feature<LineString>> = [];
  for (const segment of segments) {
    if (segment.coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: segment.coordinates },
    });
  }
  return { type: 'FeatureCollection', features };
}

function addConnectorLayers(map: MapLibreMap): void {
  if (!map.getSource(CONNECTOR_SOURCE_ID)) {
    map.addSource(CONNECTOR_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_ROUTE,
    });
  }
  if (!map.getLayer(CONNECTOR_LAYER_ID)) {
    map.addLayer({
      id: CONNECTOR_LAYER_ID,
      type: 'line',
      source: CONNECTOR_SOURCE_ID,
      paint: {
        'line-color': ROUTE_BLUE,
        'line-width': 3,
        'line-dasharray': [2, 2],
        'line-opacity': 0.9,
      },
    });
  }
}

function syncConnectorData(map: MapLibreMap, segments: readonly RouteConnectorSegment[]): void {
  const source = map.getSource(CONNECTOR_SOURCE_ID);
  if (!(source instanceof GeoJSONSource)) return;
  source.setData(
    segments.length > 0 ? connectorCollection(segments) : EMPTY_ROUTE,
  );
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
  for (const overlay of [...MAP_OVERLAYS, ...PREVIEW_OVERLAYS, ...REFERENCE_OVERLAYS]) {
    const state = layers[overlay.id];
    if (!state) continue;
    const visibility = state.visible ? 'visible' : 'none';
    if (overlay.id === 'ref.nerc_regions' && map.getLayer(NERC_LABEL_LAYER_ID)) {
      map.setLayoutProperty(NERC_LABEL_LAYER_ID, 'visibility', visibility);
    }
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

export function RouteMap({
  onMap,
  existingRoute = null,
  connectorSegments = [],
  regions = null,
}: RouteMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onMapRef = useRef(onMap);
  const fittedKey = useRef<string | null>(null);
  const existingRouteRef = useRef(existingRoute);
  const connectorSegmentsRef = useRef(connectorSegments);
  // Region codes the heavy sources' tiles were built with; '' is the plain tiles.
  const appliedTilesKey = useRef('');
  const [ready, setReady] = useState(false);
  const [shapes, setShapes] = useState<RegionShape[] | null>(null);
  const layers = useMapStore((state) => state.layers);
  const hiddenAttributes = useMapStore((state) => state.hiddenAttributes);
  onMapRef.current = onMap;
  existingRouteRef.current = existingRoute;
  connectorSegmentsRef.current = connectorSegments;
  const regionKey = sortRegions(regions ?? []).join(',');
  const regionList = regionKey ? regionKey.split(',') : [];
  // Read by onStyleLoad, which may run after a re-created style.
  const regionListRef = useRef(regionList);
  const shapesRef = useRef(shapes);
  regionListRef.current = regionList;
  shapesRef.current = shapes;

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
      // Build the heavy sources from the current regions so the first tiles requested are already filtered.
      const regionsNow = regionListRef.current;
      addOverlays(map, regionsNow);
      appliedTilesKey.current = regionsNow.join(',');
      addRouteLayers(map);
      addConnectorLayers(map);
      syncRegions(map, regionsNow, shapesRef.current, appliedTilesKey);
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
    if (!regionKey) return;
    let cancelled = false;
    getNercRegions()
      .then((collection) => {
        if (!cancelled) setShapes(regionShapes(collection));
      })
      .catch(() => {
        // Without shapes there is no mask or pan limit; the tiles still filter.
      });
    return () => {
      cancelled = true;
    };
  }, [regionKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncRegions(map, regionList, shapes, appliedTilesKey);
  }, [regionKey, shapes, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const solid = solidRouteGeometry(existingRoute, connectorSegments);
    syncRouteData(map, solid);
    if (!existingRoute) {
      fittedKey.current = null;
      return;
    }
    fitExisting(map, existingRoute, fittedKey);
  }, [existingRoute, connectorSegments, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncConnectorData(map, connectorSegments);
  }, [connectorSegments, ready]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full [&_.maplibregl-ctrl-bottom-right]:bottom-16"
    />
  );
}
