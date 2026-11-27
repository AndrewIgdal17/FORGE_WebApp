import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMapInteraction } from '@/hooks/use-map-interaction';

export interface MapTooltipProps {
  map: MapLibreMap | null;
  isDrawing: boolean;
  /** When true, default corridor inspect/hover is suppressed for line selection. */
  lineSelecting?: boolean;
}

export function MapTooltip({ map, isDrawing, lineSelecting = false }: MapTooltipProps): null {
  useMapInteraction(map, isDrawing || lineSelecting);
  return null;
}
