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
      nhd: {
        type: 'vector',
        url: `${TILES_URL}/ref.waterbodies_nhd,ref.flowlines_nhd`,
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
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#dbeafe' },
      },
      {
        id: 'water-nhd',
        type: 'fill',
        source: 'nhd',
        'source-layer': 'ref.waterbodies_nhd',
        paint: { 'fill-color': '#dbeafe' },
      },
      {
        id: 'water-nhd-rivers',
        type: 'line',
        source: 'nhd',
        'source-layer': 'ref.flowlines_nhd',
        minzoom: 8,
        paint: {
          'line-color': '#93c5fd',
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 0.5, 12, 2, 16, 6],
        },
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
