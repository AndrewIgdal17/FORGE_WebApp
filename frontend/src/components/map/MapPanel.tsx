import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { MultiLineString } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DrawingToolbar } from '@/components/map/DrawingToolbar';
import { LayerPanel } from '@/components/map/LayerPanel';
import { ResetButton } from '@/components/map/ResetButton';
import { RouteMap } from '@/components/map/RouteMap';
import { RouteStats } from '@/components/map/RouteStats';
import { useRouteAnalyze } from '@/hooks/use-route-analyze';
import { useRouteDraw } from '@/hooks/use-route-draw';
import type { AnalyzeResponse } from '@/lib/api';
import { useFormStore } from '@/stores/form-store';

export interface MapPanelProps {
  createMode?: boolean;
  existingRoute?: MultiLineString | null;
}

export function MapPanel({ createMode = true, existingRoute = null }: MapPanelProps): ReactElement {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [clearedExisting, setClearedExisting] = useState(false);
  const [finishedRoute, setFinishedRoute] = useState<MultiLineString | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzeResponse | null>(null);
  const seededMap = useRef<MapLibreMap | null>(null);
  const wasDrawingRef = useRef(false);
  const requestId = useRef(0);

  const { mode, setMode, routeGeoJSON, undo, redo, reset, isDrawing } = useRouteDraw(map);
  const { analyze, loading, error } = useRouteAnalyze();

  useLayoutEffect(() => {
    if (!map || seededMap.current === map) return;
    seededMap.current = map;
    if (!createMode) setMode('select');
  }, [map, createMode, setMode]);

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

  useEffect(() => {
    if (!finishedRoute) return;
    const id = requestId.current + 1;
    requestId.current = id;
    let cancelled = false;
    void analyze(finishedRoute).then((response) => {
      if (cancelled || id !== requestId.current || !response) return;
      setAnalyzed(response);
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
    reset();
  }

  return (
    <div className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
      <RouteMap onMap={setMap} existingRoute={showExisting} />
      <RouteStats
        route={statsRoute}
        isDrawing={isDrawing}
        result={analyzed}
        loading={loading && !isDrawing}
        error={error}
      />
      <LayerPanel />
      <ResetButton visible={statsRoute !== null} onReset={handleReset} />
      <DrawingToolbar mode={mode} onMode={setMode} onUndo={undo} onRedo={redo} />
    </div>
  );
}
