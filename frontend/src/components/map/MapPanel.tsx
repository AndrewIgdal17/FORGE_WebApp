import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { MultiLineString } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DrawingToolbar } from '@/components/map/DrawingToolbar';
import { LayerPanel } from '@/components/map/LayerPanel';
import { MapLegend } from '@/components/map/MapLegend';
import { MapTooltip } from '@/components/map/MapTooltip';
import { ResetButton } from '@/components/map/ResetButton';
import { RouteMap } from '@/components/map/RouteMap';
import { SatelliteToggle } from '@/components/map/SatelliteToggle';
import { RouteStats } from '@/components/map/RouteStats';
import { useRouteAnalyze } from '@/hooks/use-route-analyze';
import { useRouteDraw, type EndpointSubstations } from '@/hooks/use-route-draw';
import type { AnalyzeResponse } from '@/lib/api';
import { useFormStore } from '@/stores/form-store';
import { useMapStore } from '@/stores/map-store';

export interface MapPanelProps {
  createMode?: boolean;
  existingRoute?: MultiLineString | null;
  onRouteChange?: (route: MultiLineString | null, segments: unknown[] | null) => void;
}

function segmentsFor(
  route: MultiLineString,
  intersections: AnalyzeResponse['intersections'],
  endpoints: EndpointSubstations,
): unknown[] {
  const coordinates = route.coordinates[0] ?? [];
  return [
    {
      id: 0,
      geometry: { type: 'LineString', coordinates },
      intersections,
      sending_substation: endpoints.sending,
      receiving_substation: endpoints.receiving,
    },
  ];
}

export function MapPanel({
  createMode = true,
  existingRoute = null,
  onRouteChange,
}: MapPanelProps): ReactElement {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [clearedExisting, setClearedExisting] = useState(false);
  const [finishedRoute, setFinishedRoute] = useState<MultiLineString | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzeResponse | null>(null);
  const wasDrawingRef = useRef(false);
  const requestId = useRef(0);
  const onRouteChangeRef = useRef(onRouteChange);
  onRouteChangeRef.current = onRouteChange;

  const [zoom, setZoom] = useState<number | null>(null);
  const onZoom = useCallback(() => {
    if (map) setZoom(map.getZoom());
  }, [map]);
  useEffect(() => {
    if (!map) return;
    setZoom(map.getZoom());
    map.on('zoom', onZoom);
    return () => { map.off('zoom', onZoom); };
  }, [map, onZoom]);

  const { mode, setMode, routeGeoJSON, endpointSubstations, undo, redo, reset, isDrawing } =
    useRouteDraw(map);
  const endpointSubstationsRef = useRef(endpointSubstations);
  endpointSubstationsRef.current = endpointSubstations;
  const { analyze, loading, error } = useRouteAnalyze();

  useLayoutEffect(() => {
    if (!map) return;
    setMode(createMode ? 'linestring' : 'select');
  }, [map, createMode, setMode]);

  useEffect(() => {
    if (!createMode && mode !== 'linestring') return;
    useMapStore.setState((state) => {
      const layer = state.layers['ref.substations_display'];
      if (!layer || layer.visible) return state;
      return {
        layers: {
          ...state.layers,
          'ref.substations_display': { ...layer, visible: true },
        },
      };
    });
  }, [createMode, mode]);

  useEffect(() => {
    const wasDrawing = wasDrawingRef.current;
    wasDrawingRef.current = isDrawing;

    if (isDrawing) {
      if (!wasDrawing) {
        requestId.current += 1;
        setFinishedRoute(null);
        setAnalyzed(null);
      }
      return;
    }

    if (!routeGeoJSON) {
      requestId.current += 1;
      setFinishedRoute(null);
      setAnalyzed(null);
      return;
    }

    if (wasDrawing) setFinishedRoute(routeGeoJSON);
  }, [isDrawing, routeGeoJSON]);

  // Identity refreshes on vertex drag. This effect stays tied to the finished
  // line so a drag does not re-analyze the pre-drag geometry.
  useEffect(() => {
    if (!finishedRoute) return;
    const id = requestId.current + 1;
    requestId.current = id;
    const endpoints = endpointSubstationsRef.current;
    let cancelled = false;
    void analyze(finishedRoute).then((response) => {
      if (cancelled || id !== requestId.current || !response) return;
      setAnalyzed(response);
      onRouteChangeRef.current?.(
        finishedRoute,
        segmentsFor(finishedRoute, response.intersections, endpoints),
      );
      useFormStore.getState().applyChanges(response.changes);
    });
    return () => {
      cancelled = true;
    };
  }, [analyze, finishedRoute]);

  const showExisting = !clearedExisting && existingRoute && !routeGeoJSON ? existingRoute : null;
  const statsRoute = routeGeoJSON ?? showExisting;

  function handleReset(): void {
    requestId.current += 1;
    setFinishedRoute(null);
    setAnalyzed(null);
    setClearedExisting(true);
    onRouteChangeRef.current?.(null, null);
    reset();
    const zeroChanges: Record<string, unknown> = {};
    const terrainCategories = [
      'forested',
      'wetland',
      'scrubbed_flat',
      'urban',
      'farmland',
      'desert_barren',
      'mountain',
      'rolling_hills',
      'subsea',
    ];
    for (const cat of terrainCategories) {
      zeroChanges[`02_project_physical_details.terrain.terrain_miles.${cat}`] = 0;
    }
    for (let zone = 1; zone <= 15; zone += 1) {
      zeroChanges[`11_project_row_details.right_of_way.zone_${zone}.miles`] = 0;
    }
    useFormStore.getState().applyChanges(zeroChanges);
  }

  return (
    <div className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
      <RouteMap onMap={setMap} existingRoute={showExisting} />
      <MapTooltip map={map} isDrawing={isDrawing} />
      <RouteStats
        route={statsRoute}
        isDrawing={isDrawing}
        result={analyzed}
        endpoints={endpointSubstations}
        loading={loading && !isDrawing}
        error={error}
      />
      <LayerPanel />
      <MapLegend />
      <ResetButton visible={statsRoute !== null} onReset={handleReset} />
      <DrawingToolbar mode={mode} onMode={setMode} onUndo={undo} onRedo={redo} />
      <SatelliteToggle map={map} />
      {zoom !== null ? (
        <div className="absolute bottom-4 left-4 z-10 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white">
          z{zoom.toFixed(1)} {zoom < 8 ? '· snap off' : '· snap on'}
        </div>
      ) : null}
    </div>
  );
}
