import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMapInteraction } from '@/hooks/use-map-interaction';

export interface MapTooltipProps {
  map: MapLibreMap | null;
  isDrawing: boolean;
}

export function MapTooltip({ map, isDrawing }: MapTooltipProps): null {
  useMapInteraction(map, isDrawing);
  return null;
}
