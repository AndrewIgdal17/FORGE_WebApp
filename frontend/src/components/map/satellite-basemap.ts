import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  LIGHT_BASEMAP_LAYER_IDS,
  PLACE_LABEL_LAYER_ID,
  PLACE_LABEL_MAP_PAINT,
  PLACE_LABEL_SATELLITE_PAINT,
  SATELLITE_LAYER_ID,
} from '@/data/basemap-style';

export function setSatelliteBasemap(map: MapLibreMap, enabled: boolean): boolean {
  if (!map.isStyleLoaded() || !map.getLayer(SATELLITE_LAYER_ID)) return false;

  map.setLayoutProperty(SATELLITE_LAYER_ID, 'visibility', enabled ? 'visible' : 'none');

  const lightVisibility = enabled ? 'none' : 'visible';
  for (const layerId of LIGHT_BASEMAP_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    map.setLayoutProperty(layerId, 'visibility', lightVisibility);
  }

  if (map.getLayer(PLACE_LABEL_LAYER_ID)) {
    const paint = enabled ? PLACE_LABEL_SATELLITE_PAINT : PLACE_LABEL_MAP_PAINT;
    map.setPaintProperty(PLACE_LABEL_LAYER_ID, 'text-color', paint['text-color']);
    map.setPaintProperty(PLACE_LABEL_LAYER_ID, 'text-halo-color', paint['text-halo-color']);
    map.setPaintProperty(PLACE_LABEL_LAYER_ID, 'text-halo-width', paint['text-halo-width']);
  }

  return true;
}
