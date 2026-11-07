import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { MultiLineString } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DrawingToolbar } from '@/components/map/DrawingToolbar';
import {
  finishedRouteStep,
  type HeldRouteSegments,
} from '@/components/map/finished-route';
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
import { changesAfterAnalyze, resolvedRowWidthFt } from '@/lib/analyze-request';
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
  const heldSegmentsRef = useRef<HeldRouteSegments | null>(null);
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
  const data = useFormStore((state) => state.data);
  const lookups = useFormStore((state) => state.lookups);
  const rowWidthFt = useMemo(() => {
    if (!lookups || !data) return null;
    return resolvedRowWidthFt(useFormStore.getState().getProjectFields(), lookups);
  }, [lookups, data]);
  const widthError = useMemo(() => {
    const step = finishedRouteStep(finishedRoute, rowWidthFt, null);
    return step.kind === 'pending' ? new Error(step.message) : null;
  }, [finishedRoute, rowWidthFt]);

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
  // line so a drag does not re-analyze the pre-drag geometry. A missing width
  // still publishes that line and does not call analyze.
  useEffect(() => {
    const step = finishedRouteStep(finishedRoute, rowWidthFt, heldSegmentsRef.current);
    if (step.kind === 'none') {
      heldSegmentsRef.current = null;
      return;
    }
    if (step.kind === 'pending') {
      requestId.current += 1;
      setAnalyzed(null);
      onRouteChangeRef.current?.(step.route, step.segments);
      return;
    }
    const id = requestId.current + 1;
    requestId.current = id;
    const endpoints = endpointSubstationsRef.current;
    let cancelled = false;
    void analyze(step.route, step.rowWidthFt).then((response) => {
      if (cancelled || id !== requestId.current || !response) return;
      setAnalyzed(response);
      const segments = segmentsFor(step.route, response.intersections, endpoints);
      heldSegmentsRef.current = { route: step.route, segments };
      onRouteChangeRef.current?.(step.route, segments);
      useFormStore
        .getState()
        .applyChanges(changesAfterAnalyze(response.changes));
    });
    return () => {
      cancelled = true;
    };
  }, [analyze, finishedRoute, rowWidthFt]);

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
        error={widthError ?? error}
      />
      <LayerPanel />
      <MapLegend />
      <ResetButton visible={statsRoute !== null} onReset={handleReset} />
      <DrawingToolbar mode={mode} onMode={setMode} onUndo={undo} onRedo={redo} />
      <SatelliteToggle map={map} />
      {zoom !== null ? (
        <div className="absolute bottom-4 left-4 z-10 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white">
          z{zoom.toFixed(1)} {zoom < 11 ? '· subs off' : zoom < 13.5 ? '· subs on · snap off' : '· snap on'}
        </div>
      ) : null}
    </div>
  );
}
