import type { StyleSpecification } from 'maplibre-gl';

const TILES_URL = 'https://tiles.forge-calc.com';

export function forgeBasemapStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'FORGE Light',
    sources: {
      basemap: {
        type: 'vector',
        url: `${TILES_URL}/basemap`,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#f8fafc' },
      },
      {
        id: 'earth',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'earth',
        paint: { 'fill-color': '#f1f5f9' },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'water',
        paint: { 'fill-color': '#dbeafe' },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'landuse',
        paint: { 'fill-color': '#f1f5f9', 'fill-opacity': 0.5 },
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
        id: 'places-label',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'places',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': '#64748b',
          'text-halo-color': '#f8fafc',
          'text-halo-width': 1,
        },
        minzoom: 6,
      },
    ],
    glyphs: 'https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf',
  };
}
