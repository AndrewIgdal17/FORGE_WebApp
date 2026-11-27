import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { MultiLineString } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { toast } from 'sonner';
import { CircuitPicker } from '@/components/map/CircuitPicker';
import { DrawingToolbar } from '@/components/map/DrawingToolbar';
import { LineSelectPanel } from '@/components/map/LineSelectPanel';
import { applyDrawnRouteReset } from '@/components/map/drawn-route-reset';
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
import {
  syncTerminalMarkers,
  type TerminalMarkerSpec,
} from '@/components/map/terminal-markers';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useLineSelect } from '@/hooks/use-line-select';
import { useRouteAnalyze } from '@/hooks/use-route-analyze';
import {
  SUBSTATION_SNAP_MIN_ZOOM,
  substationHitAt,
  useRouteDraw,
  type DrawTerminals,
  type EndpointSubstations,
} from '@/hooks/use-route-draw';
import { ApiError, assembleLine, type AnalyzeResponse, type AssembleLinePiece, type LineConnector, type LineSelectionIn } from '@/lib/api';
import { selectionSummary, toggleGid } from '@/lib/line-select';
import type { CorridorCandidate } from '@/lib/line-select';
import { resolvedRowWidthFt, rowWidthProblem } from '@/lib/analyze-request';
import { pointTerminalName } from '@/lib/terminals';
import { useFormStore } from '@/stores/form-store';
import { useMapStore } from '@/stores/map-store';
import type { DraftTerminal } from '@/stores/scenario-store';

const TERMINAL_MISMATCH_TOAST_ID = 'route-terminal-mismatch';

const NO_MARKERS: readonly TerminalMarkerSpec[] = [];

export interface MapPanelProps {
  createMode?: boolean;
  drawingEnabled?: boolean;
  lineSelectEnabled?: boolean;
  existingRoute?: MultiLineString | null;
  initialSelectedGids?: number[];
  storedConnectors?: LineConnector[];
  terminalSubstations?: { sending: number | null; receiving: number | null };
  onRouteChange?: (route: MultiLineString | null, segments: unknown[] | null) => void;
  onLineSelectionCommit?: (selection: LineSelectionIn | null) => void;
  onAnalyzed?: () => void;
  terminalMarkers?: readonly TerminalMarkerSpec[];
  drawTerminals?: DrawTerminals | null;
  terminalPick?: 'sending' | 'receiving' | null;
  onPickTerminal?: (terminal: DraftTerminal) => void;
}

function pickedSubstationName(name: string | null, gid: number): string {
  if (name && !/^UNKNOWN\d*$/i.test(name)) return name;
  return `Substation ${gid}`;
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

function assembleErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const body = error.body as Record<string, unknown>;
    const nested = body.error;
    if (nested && typeof nested === 'object' && typeof (nested as { message?: string }).message === 'string') {
      return (nested as { message: string }).message;
    }
    if (typeof body.message === 'string' && body.message) return body.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not assemble the line';
}

export function MapPanel({
  createMode = true,
  drawingEnabled = true,
  lineSelectEnabled = false,
  existingRoute = null,
  initialSelectedGids,
  storedConnectors,
  terminalSubstations,
  onRouteChange,
  onLineSelectionCommit,
  onAnalyzed,
  terminalMarkers = NO_MARKERS,
  drawTerminals = null,
  terminalPick = null,
  onPickTerminal,
}: MapPanelProps): ReactElement {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [clearedExisting, setClearedExisting] = useState(false);
  const [finishedRoute, setFinishedRoute] = useState<MultiLineString | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzeResponse | null>(null);
  const wasDrawingRef = useRef(false);
  const finishedRouteRef = useRef<MultiLineString | null>(null);
  const hasDrawTerminalsRef = useRef(false);
  const [pointConfirm, setPointConfirm] = useState<[number, number] | null>(null);
  const onPickTerminalRef = useRef(onPickTerminal);
  const requestId = useRef(0);
  const heldSegmentsRef = useRef<HeldRouteSegments | null>(null);
  const onRouteChangeRef = useRef(onRouteChange);
  onRouteChangeRef.current = onRouteChange;
  const onAnalyzedRef = useRef(onAnalyzed);
  onAnalyzedRef.current = onAnalyzed;
  onPickTerminalRef.current = onPickTerminal;
  hasDrawTerminalsRef.current = drawTerminals != null;

  const [selectedGids, setSelectedGids] = useState<number[]>(initialSelectedGids ?? []);
  const [pickerCandidates, setPickerCandidates] = useState<CorridorCandidate[] | null>(null);
  const [assembledPieces, setAssembledPieces] = useState<AssembleLinePiece[]>([]);
  const [assembledConnectors, setAssembledConnectors] = useState<LineConnector[]>(storedConnectors ?? []);
  const [lineSummary, setLineSummary] = useState<string | null>(null);
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const onLineSelectionCommitRef = useRef(onLineSelectionCommit);
  onLineSelectionCommitRef.current = onLineSelectionCommit;

  useEffect(() => {
    setSelectedGids(initialSelectedGids ?? []);
  }, [initialSelectedGids]);

  useEffect(() => {
    if (storedConnectors) setAssembledConnectors(storedConnectors);
  }, [storedConnectors]);

  useEffect(() => {
    if (!lineSelectEnabled) {
      setSelectedGids([]);
      setAssembledPieces([]);
      setAssembledConnectors([]);
      setLineSummary(null);
      setAssembleError(null);
    }
  }, [lineSelectEnabled]);

  const lineSelectActive = lineSelectEnabled && drawTerminals != null && terminalPick == null;
  useLineSelect(map, {
    active: lineSelectActive,
    selectedGids,
    onSelectedGids: (gids) => {
      setSelectedGids(gids);
      setAssembleError(null);
      setLineSummary(null);
      onLineSelectionCommitRef.current?.(null);
    },
    onPickerOpen: setPickerCandidates,
  });

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

  const onTerminalMismatch = useCallback((message: string) => {
    toast.error(message, { id: TERMINAL_MISMATCH_TOAST_ID });
  }, []);
  const onTerminalMatch = useCallback(() => {
    toast.dismiss(TERMINAL_MISMATCH_TOAST_ID);
  }, []);
  const {
    mode,
    setMode,
    routeGeoJSON,
    endpointSubstations,
    terminalEndsOk,
    undo,
    redo,
    reset,
    isDrawing,
  } = useRouteDraw(map, { terminals: drawTerminals, onTerminalMismatch, onTerminalMatch });
  const endpointSubstationsRef = useRef(endpointSubstations);
  endpointSubstationsRef.current = endpointSubstations;
  const { analyze, loading, error } = useRouteAnalyze();
  const data = useFormStore((state) => state.data);
  const lookups = useFormStore((state) => state.lookups);
  const rowWidthFt = useMemo(() => {
    if (!lookups || !data) return null;
    return resolvedRowWidthFt(useFormStore.getState().getProjectFields(), lookups);
  }, [lookups, data]);
  const widthMessage = useMemo(() => {
    if (!lookups || !data) return undefined;
    return rowWidthProblem(useFormStore.getState().getProjectFields(), lookups) ?? undefined;
  }, [lookups, data]);
  const widthError = useMemo(() => {
    const step = finishedRouteStep(finishedRoute, rowWidthFt, null, widthMessage);
    return step.kind === 'pending' ? new Error(step.message) : null;
  }, [finishedRoute, rowWidthFt, widthMessage]);

  useLayoutEffect(() => {
    if (!map) return;
    if (!drawingEnabled) {
      setMode('select');
      return;
    }
    setMode(createMode ? 'linestring' : 'select');
  }, [map, createMode, drawingEnabled, setMode]);

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
    if (lineSelectEnabled) return;
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

    if (!terminalEndsOk) {
      if (wasDrawing) {
        requestId.current += 1;
        setFinishedRoute(null);
        setAnalyzed(null);
      }
      return;
    }

    if (wasDrawing || (hasDrawTerminalsRef.current && finishedRouteRef.current === null)) {
      setFinishedRoute(routeGeoJSON);
    }
  }, [lineSelectEnabled, isDrawing, routeGeoJSON, terminalEndsOk]);

  // Identity refreshes on vertex drag. This effect stays tied to the finished
  // line so a drag does not re-analyze the pre-drag geometry. A missing width
  // still publishes that line and does not call analyze.
  useEffect(() => {
    const step = finishedRouteStep(
      finishedRoute,
      rowWidthFt,
      heldSegmentsRef.current,
      widthMessage,
    );
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
      useFormStore.getState().recordAnalysis(response);
      onAnalyzedRef.current?.();
    });
    return () => {
      cancelled = true;
    };
  }, [analyze, finishedRoute, rowWidthFt, widthMessage]);

  finishedRouteRef.current = finishedRoute;

  useEffect(() => {
    if (!map) return;
    return syncTerminalMarkers(map, terminalMarkers);
  }, [map, terminalMarkers]);

  useEffect(() => {
    setPointConfirm(null);
  }, [terminalPick]);

  useEffect(() => {
    if (!map || !terminalPick) return;
    const container = map.getContainer();
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.maplibregl-ctrl, button, a, input, [role="dialog"]')) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = substationHitAt(map, { x, y });
      if (hit) {
        event.preventDefault();
        event.stopPropagation();
        onPickTerminalRef.current?.({
          substation_gid: hit.gid,
          name: pickedSubstationName(hit.name, hit.gid),
          point: hit.point,
        });
        return;
      }
      if (map.getZoom() < SUBSTATION_SNAP_MIN_ZOOM) return;
      const lngLat = map.unproject([x, y]);
      if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;
      event.preventDefault();
      event.stopPropagation();
      setPointConfirm([lngLat.lng, lngLat.lat]);
    };
    container.addEventListener('click', onClick, true);
    return () => container.removeEventListener('click', onClick, true);
  }, [map, terminalPick]);

  function confirmPoint(): void {
    if (!pointConfirm) return;
    onPickTerminalRef.current?.({
      substation_gid: null,
      name: pointTerminalName(pointConfirm),
      point: pointConfirm,
    });
    setPointConfirm(null);
  }

  const showExisting = !clearedExisting && existingRoute && !routeGeoJSON ? existingRoute : null;
  const lineRoute = lineSelectEnabled ? finishedRoute : null;
  const displayedRoute = lineSelectEnabled ? lineRoute ?? showExisting : showExisting;
  const statsRoute = routeGeoJSON ?? lineRoute ?? showExisting;

  async function handleUseLine(): Promise<void> {
    if (!drawTerminals || selectedGids.length === 0) return;
    const stretchEnd =
      terminalSubstations?.receiving === null ? drawTerminals.receiving : null;
    setAssembling(true);
    setAssembleError(null);
    try {
      const response = await assembleLine({
        gids: selectedGids,
        sending: drawTerminals.sending,
        receiving: drawTerminals.receiving,
        ...(terminalSubstations?.sending !== undefined && terminalSubstations.sending !== null
          ? { sending_gid: terminalSubstations.sending }
          : {}),
        ...(terminalSubstations?.receiving !== undefined && terminalSubstations.receiving !== null
          ? { receiving_gid: terminalSubstations.receiving }
          : {}),
        stretch_end: stretchEnd,
      });
      setAssembledPieces(response.pieces);
      setAssembledConnectors(response.connectors);
      const summary = selectionSummary(response.pieces, response.connectors);
      setLineSummary(summary);
      setFinishedRoute(response.route);
      requestId.current += 1;
      setClearedExisting(true);
      onLineSelectionCommitRef.current?.({
        gids: selectedGids,
        stretch_end: stretchEnd,
      });
    } catch (error) {
      setAssembleError(assembleErrorMessage(error));
    } finally {
      setAssembling(false);
    }
  }

  function handlePickerChoose(candidate: CorridorCandidate): void {
    setSelectedGids((current) => toggleGid(current, candidate.gid));
    setPickerCandidates(null);
    setAssembleError(null);
    onLineSelectionCommitRef.current?.(null);
  }

  function handleRemoveGid(gid: number): void {
    setSelectedGids((current) => current.filter((value) => value !== gid));
    setAssembleError(null);
    onLineSelectionCommitRef.current?.(null);
  }

  function handleReset(): void {
    requestId.current += 1;
    setFinishedRoute(null);
    setAnalyzed(null);
    setClearedExisting(true);
    setSelectedGids([]);
    setAssembledPieces([]);
    setAssembledConnectors([]);
    setLineSummary(null);
    setAssembleError(null);
    onLineSelectionCommitRef.current?.(null);
    onRouteChangeRef.current?.(null, null);
    reset();
    if (!drawingEnabled) setMode('select');
    applyDrawnRouteReset();
  }

  const connectorSegments = useMemo(
  () =>
    assembledConnectors.map((connector) => ({
      coordinates: connector.coordinates,
    })),
  [assembledConnectors],
  );

  return (
    <div className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
      <RouteMap
        onMap={setMap}
        existingRoute={displayedRoute}
        connectorSegments={connectorSegments}
      />
      {terminalPick ? (
        <div
          data-terminal-banner
          className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-md bg-slate-900/90 px-4 py-2 text-sm text-white"
        >
          {terminalPick === 'sending'
            ? 'Click the sending substation'
            : 'Click the receiving substation'}
        </div>
      ) : null}
      <MapTooltip map={map} isDrawing={isDrawing} lineSelecting={lineSelectActive} />
      {lineSelectActive ? (
        <LineSelectPanel
          selectedGids={selectedGids}
          pieces={assembledPieces}
          connectors={assembledConnectors}
          summary={lineSummary}
          assembleError={assembleError}
          assembling={assembling}
          onRemove={handleRemoveGid}
          onUseLine={() => { void handleUseLine(); }}
        />
      ) : null}
      <CircuitPicker
        open={pickerCandidates !== null}
        candidates={pickerCandidates ?? []}
        onChoose={handlePickerChoose}
        onClose={() => setPickerCandidates(null)}
      />
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
      <DrawingToolbar
        mode={mode}
        drawingEnabled={drawingEnabled}
        lineSelectMode={lineSelectEnabled}
        lineSelectEnabled={lineSelectEnabled && drawTerminals != null}
        onMode={setMode}
        onUndo={undo}
        onRedo={redo}
      />
      <SatelliteToggle map={map} />
      {zoom !== null ? (
        <div className="absolute bottom-4 left-4 z-10 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white">
          z{zoom.toFixed(1)} {zoom < 11 ? '· subs off' : zoom < 13.5 ? '· subs on · snap off' : '· snap on'}
        </div>
      ) : null}
      <ConfirmDialog
        open={pointConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPointConfirm(null);
        }}
        title="This point is not a substation. Use it anyway?"
        description="The terminal will be this map point."
        confirmLabel="Use this point"
        onConfirm={confirmPoint}
      />
    </div>
  );
}
