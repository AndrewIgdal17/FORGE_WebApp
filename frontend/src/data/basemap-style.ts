import type { StyleSpecification } from 'maplibre-gl';

const TILES_URL = 'https://tiles.forge-calc.com';

export const SATELLITE_LAYER_ID = 'satellite';

/** Light fills hidden while satellite imagery is showing. `water` stays hidden in both modes. */
export const LIGHT_BASEMAP_LAYER_IDS = ['background', 'earth', 'landuse'] as const;

export const PLACE_LABEL_LAYER_ID = 'places-label';

export const PLACE_LABEL_MAP_PAINT = {
  'text-color': '#64748b',
  'text-halo-color': '#f8fafc',
  'text-halo-width': 1,
} as const;

export const PLACE_LABEL_SATELLITE_PAINT = {
  'text-color': '#f8fafc',
  'text-halo-color': '#000000',
  'text-halo-width': 2,
} as const;

const SATELLITE_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function forgeBasemapStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'FORGE Light',
    sources: {
      basemap: {
        type: 'vector',
        url: `${TILES_URL}/basemap`,
      },
      county_borders: {
        type: 'vector',
        url: `${TILES_URL}/ref.counties_tiger`,
      },
      state_borders: {
        type: 'vector',
        url: `${TILES_URL}/ref.states`,
      },
      satellite: {
        type: 'raster',
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        layout: { visibility: 'none' },
        paint: { 'background-color': '#f8fafc' },
      },
      {
        id: SATELLITE_LAYER_ID,
        type: 'raster',
        source: 'satellite',
        paint: {},
      },
      {
        id: 'earth',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'earth',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#f1f5f9' },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'water',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#dbeafe' },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'landuse',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#f1f5f9', 'fill-opacity': 0.5 },
      },
      {
        id: 'county-borders',
        type: 'line',
        source: 'county_borders',
        'source-layer': 'ref.counties_tiger',
        minzoom: 6,
        paint: {
          'line-color': '#cbd5e1',
          'line-width': 0.5,
        },
      },
      {
        id: 'state-borders',
        type: 'line',
        source: 'state_borders',
        'source-layer': 'ref.states',
        paint: {
          'line-color': '#94a3b8',
          'line-width': 1.5,
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'highway'],
        paint: { 'line-color': '#94a3b8', 'line-width': 1 },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        filter: ['!=', ['get', 'kind'], 'highway'],
        paint: { 'line-color': '#cbd5e1', 'line-width': 0.5 },
        minzoom: 10,
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundaries',
        paint: {
          'line-color': '#cbd5e1',
          'line-width': 0.5,
          'line-dasharray': [4, 2],
        },
      },
      {
        id: PLACE_LABEL_LAYER_ID,
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'places',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: { ...PLACE_LABEL_SATELLITE_PAINT },
        minzoom: 6,
      },
    ],
    glyphs: 'https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf',
  };
}
