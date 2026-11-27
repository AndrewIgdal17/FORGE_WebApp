import { useCallback, useEffect, useRef, useState } from 'react';
import type { MultiLineString, Position } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawModeUndoRedo,
  TerraDrawSelectMode,
  TerraDrawSessionUndoRedo,
} from 'terra-draw';
import type { GeoJSONStoreFeatures, SnapToCustom, TerraDrawEventListeners } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import {
  TERMINAL_TOLERANCE_M,
  haversineM,
  routeEndsMatch,
  routeFinishMessage,
} from '@/lib/terminals';

type FeatureId = string | number;

export type DrawMode = 'linestring' | 'select';

export interface SubstationIdentity {
  gid: number;
  name: string | null;
  voltage_kv: string | null;
}

export interface EndpointSubstations {
  sending: SubstationIdentity | null;
  receiving: SubstationIdentity | null;
}

export interface DrawTerminals {
  sending: [number, number];
  receiving: [number, number];
  sendingName: string;
  receivingName: string;
}

export interface RouteDrawOptions {
  terminals?: DrawTerminals | null;
  onTerminalMismatch?: (message: string) => void;
}

export interface SubstationHit {
  gid: number;
  name: string | null;
  voltage_kv: string | null;
  point: [number, number];
}

export interface RouteDraw {
  mode: DrawMode;
  setMode: (mode: DrawMode) => void;
  routeGeoJSON: MultiLineString | null;
  endpointSubstations: EndpointSubstations;
  /** False when a finished line does not meet the project's terminals. */
  terminalEndsOk: boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  isDrawing: boolean;
}

const ROUTE_BLUE = '#3b82f6' as const;
const ROUTE_WHITE = '#ffffff' as const;
const DRAW_MODE: DrawMode = 'linestring';
const EDIT_MODE: DrawMode = 'select';
const SUBSTATION_HIT_LAYER = 'ref.substations_display-hit';
const HIT_PADDING_PX = 6;
export const SUBSTATION_SNAP_MIN_ZOOM = 13.5;
const NO_SUBSTATIONS: EndpointSubstations = { sending: null, receiving: null };

function textProp(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function gidProp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function substationHitAt(
  map: MapLibreMap,
  point: { x: number; y: number },
): SubstationHit | null {
  if (map.isStyleLoaded() !== true || !map.getLayer(SUBSTATION_HIT_LAYER)) return null;
  const features = map.queryRenderedFeatures(
    [
      [point.x - HIT_PADDING_PX, point.y - HIT_PADDING_PX],
      [point.x + HIT_PADDING_PX, point.y + HIT_PADDING_PX],
    ],
    { layers: [SUBSTATION_HIT_LAYER] },
  );
  for (const feature of features) {
    if (feature.geometry.type !== 'Point') continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const properties = feature.properties ?? {};
    const gid = gidProp(properties.gid) ?? gidProp(feature.id);
    if (gid === null) continue;
    return {
      gid,
      name: textProp(properties.name),
      voltage_kv: textProp(properties.voltage_kv),
      point: [longitude, latitude],
    };
  }
  return null;
}

function substationSnapTarget(
  map: MapLibreMap,
  x: number,
  y: number,
): Position | undefined {
  if (map.getZoom() < SUBSTATION_SNAP_MIN_ZOOM) return undefined;
  const hit = substationHitAt(map, { x, y });
  return hit ? hit.point : undefined;
}

function substationAt(map: MapLibreMap, position: Position): SubstationIdentity | null {
  const longitude = position[0];
  const latitude = position[1];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const point = map.project([longitude, latitude]);
  const hit = substationHitAt(map, point);
  if (!hit) return null;
  return { gid: hit.gid, name: hit.name, voltage_kv: hit.voltage_kv };
}

function snapToTerminals(
  terminals: DrawTerminals | null,
  event: { lng: number; lat: number },
  context: { currentCoordinate?: number } | undefined,
): Position | undefined {
  if (!terminals) return undefined;
  if (context?.currentCoordinate === 0) {
    return [terminals.sending[0], terminals.sending[1]];
  }
  if (!Number.isFinite(event.lng) || !Number.isFinite(event.lat)) return undefined;
  const click: [number, number] = [event.lng, event.lat];
  if (haversineM(click, terminals.receiving) <= TERMINAL_TOLERANCE_M) {
    return [terminals.receiving[0], terminals.receiving[1]];
  }
  return undefined;
}

function endsWithinTerminals(
  terminals: DrawTerminals | null,
  route: MultiLineString | null,
): boolean {
  if (!terminals || !route) return true;
  return routeEndsMatch(route, terminals.sending, terminals.receiving).ok;
}

function substationsFor(map: MapLibreMap, route: MultiLineString): EndpointSubstations {
  const firstLine = route.coordinates[0];
  const lastLine = route.coordinates[route.coordinates.length - 1];
  const sending = firstLine?.[0];
  const receiving = lastLine?.[lastLine.length - 1];
  return {
    sending: sending ? substationAt(map, sending) : null,
    receiving: receiving ? substationAt(map, receiving) : null,
  };
}

function isDrawMode(mode: string): mode is DrawMode {
  return mode === DRAW_MODE || mode === EDIT_MODE;
}

function featureId(feature: GeoJSONStoreFeatures): FeatureId | null {
  const id = feature.id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return null;
}

function lineStrings(draw: TerraDraw): GeoJSONStoreFeatures[] {
  return draw.getSnapshot().filter((feature) => feature.geometry.type === 'LineString');
}

function isFinishedLine(feature: GeoJSONStoreFeatures): boolean {
  return feature.properties.currentlyDrawing !== true;
}

function finishedLineId(draw: TerraDraw): FeatureId | null {
  const finished = lineStrings(draw).filter(isFinishedLine);
  if (finished.length === 0) return null;
  return featureId(finished[0]);
}

function positionsOf(feature: GeoJSONStoreFeatures): Position[] {
  if (feature.geometry.type !== 'LineString') return [];
  return feature.geometry.coordinates;
}

function toMultiLineString(coordinates: Position[]): MultiLineString | null {
  const line = coordinates
    .filter((position) => position.length >= 2)
    .map((position): [number, number] => [position[0], position[1]]);
  if (line.length < 2) return null;
  return { type: 'MultiLineString', coordinates: [line] };
}

function routeGeometry(draw: TerraDraw): MultiLineString | null {
  const lines = lineStrings(draw);
  const chosen = lines.find(isFinishedLine) ?? lines[0];
  if (!chosen) return null;
  return toMultiLineString(positionsOf(chosen));
}

function sameRoute(left: MultiLineString | null, right: MultiLineString | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left.coordinates) === JSON.stringify(right.coordinates);
}

function sameIdentity(left: SubstationIdentity | null, right: SubstationIdentity | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.gid === right.gid && left.name === right.name && left.voltage_kv === right.voltage_kv;
}

function sameEndpoints(left: EndpointSubstations, right: EndpointSubstations): boolean {
  return sameIdentity(left.sending, right.sending) && sameIdentity(left.receiving, right.receiving);
}

function readDrawing(draw: TerraDraw): boolean {
  return draw.getMode() === DRAW_MODE && draw.getModeState() === 'drawing';
}

function createDraw(
  map: MapLibreMap,
  terminalsRef: { readonly current: DrawTerminals | null },
): TerraDraw {
  const toCustom: SnapToCustom = (event, context) => {
    const terminal = snapToTerminals(terminalsRef.current, event, context);
    if (terminal) return terminal;
    return substationSnapTarget(map, event.containerX, event.containerY);
  };

  return new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawLineStringMode({
        snapping: { toCustom },
        styles: {
          lineStringColor: ROUTE_BLUE,
          lineStringWidth: 3,
          coordinatePointColor: ROUTE_WHITE,
          coordinatePointOutlineColor: ROUTE_BLUE,
          coordinatePointOutlineWidth: 2,
          coordinatePointWidth: 8,
          closingPointColor: ROUTE_WHITE,
          closingPointOutlineColor: ROUTE_BLUE,
          closingPointOutlineWidth: 2,
          closingPointWidth: 8,
        },
      }),
      new TerraDrawSelectMode({
        flags: {
          linestring: {
            feature: {
              draggable: false,
              rotateable: false,
              scaleable: false,
              coordinates: {
                midpoints: false,
                draggable: true,
                deletable: false,
                snappable: { toCustom },
              },
            },
          },
        },
        styles: {
          selectedLineStringColor: ROUTE_BLUE,
          selectedLineStringWidth: 3,
          selectionPointColor: ROUTE_WHITE,
          selectionPointOutlineColor: ROUTE_BLUE,
          selectionPointOutlineWidth: 2,
          selectionPointWidth: 8,
        },
      }),
    ],
    undoRedo: {
      modeLevel: new TerraDrawModeUndoRedo(),
      sessionLevel: new TerraDrawSessionUndoRedo(),
    },
  });
}

export function useRouteDraw(
  map: MapLibreMap | null,
  options?: RouteDrawOptions,
): RouteDraw {
  const drawRef = useRef<TerraDraw | null>(null);
  const pendingMode = useRef<DrawMode>(DRAW_MODE);
  const terminalsRef = useRef<DrawTerminals | null>(options?.terminals ?? null);
  terminalsRef.current = options?.terminals ?? null;
  const onMismatchRef = useRef(options?.onTerminalMismatch);
  onMismatchRef.current = options?.onTerminalMismatch;
  const lastMismatchRef = useRef<string | null>(null);
  const [mode, setModeState] = useState<DrawMode>(DRAW_MODE);
  const [routeGeoJSON, setRouteGeoJSON] = useState<MultiLineString | null>(null);
  const [endpointSubstations, setEndpointSubstations] =
    useState<EndpointSubstations>(NO_SUBSTATIONS);
  const [terminalEndsOk, setTerminalEndsOk] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);

  const noteMismatch = useCallback((route: MultiLineString | null) => {
    const terminals = terminalsRef.current;
    if (!terminals || !route) return;
    const match = routeEndsMatch(route, terminals.sending, terminals.receiving);
    if (match.ok) {
      lastMismatchRef.current = null;
      return;
    }
    const name = match.end === 'sending' ? terminals.sendingName : terminals.receivingName;
    const message = routeFinishMessage(match.end, name);
    if (lastMismatchRef.current === message) return;
    lastMismatchRef.current = message;
    onMismatchRef.current?.(message);
  }, []);

  const publish = useCallback((draw: TerraDraw) => {
    const current = draw.getMode();
    setModeState(isDrawMode(current) ? current : DRAW_MODE);
    setIsDrawing(readDrawing(draw));
    const nextRoute = routeGeometry(draw);
    setRouteGeoJSON((currentRoute) => (sameRoute(currentRoute, nextRoute) ? currentRoute : nextRoute));
    const ok = endsWithinTerminals(terminalsRef.current, nextRoute);
    setTerminalEndsOk((currentOk) => (currentOk === ok ? currentOk : ok));
  }, []);

  useEffect(() => {
    if (!map) return;

    let cancelled = false;
    let adjusting = false;
    const draw = createDraw(map, terminalsRef);
    drawRef.current = draw;

    const rejectExtraLines = (): boolean => {
      if (adjusting || !draw.enabled) return false;
      const lines = lineStrings(draw);
      const finished = lines.filter(isFinishedLine);
      if (finished.length === 0) return false;
      const keep = featureId(finished[0]);
      if (keep === null) return false;
      const removeIds = lines
        .map(featureId)
        .filter((id): id is FeatureId => id !== null && id !== keep);
      if (removeIds.length === 0) return false;
      adjusting = true;
      try {
        draw.removeFeatures(removeIds);
      } finally {
        adjusting = false;
      }
      return true;
    };

    const focusFinishedLine = (): void => {
      const id = finishedLineId(draw);
      if (id === null || !draw.enabled) return;
      if (draw.getMode() !== EDIT_MODE) draw.setMode(EDIT_MODE);
      pendingMode.current = EDIT_MODE;
      draw.selectFeature(id);
    };

    const refreshEndpoints = (): void => {
      const route = routeGeometry(draw);
      const next = route ? substationsFor(map, route) : NO_SUBSTATIONS;
      setEndpointSubstations((current) => (sameEndpoints(current, next) ? current : next));
    };

    const onFinish: TerraDrawEventListeners['finish'] = (_id, context) => {
      queueMicrotask(() => {
        if (cancelled || !draw.enabled) return;
        rejectExtraLines();
        if (context.action === 'draw' && context.mode === DRAW_MODE) {
          focusFinishedLine();
        }
        refreshEndpoints();
        publish(draw);
        noteMismatch(routeGeometry(draw));
      });
    };

    const onChange: TerraDrawEventListeners['change'] = (_ids, type) => {
      if (cancelled || adjusting || type === 'styling') return;
      if (draw.getMode() === EDIT_MODE) {
        refreshEndpoints();
        publish(draw);
        noteMismatch(routeGeometry(draw));
        return;
      }
      if (type === 'create') {
        queueMicrotask(() => {
          if (cancelled || !draw.enabled) return;
          if (rejectExtraLines()) focusFinishedLine();
          publish(draw);
        });
        return;
      }
      publish(draw);
    };

    const begin = (): void => {
      if (cancelled || draw.enabled) return;
      draw.start();
      draw.setMode(pendingMode.current);
      publish(draw);
    };

    draw.on('finish', onFinish);
    draw.on('change', onChange);

    const onStyleLoad = (): void => {
      begin();
    };

    if (map.isStyleLoaded() === true) {
      begin();
    } else {
      map.on('style.load', onStyleLoad);
    }

    return () => {
      cancelled = true;
      map.off('style.load', onStyleLoad);
      draw.off('finish', onFinish);
      draw.off('change', onChange);
      if (draw.enabled) draw.stop();
      if (drawRef.current === draw) drawRef.current = null;
    };
  }, [map, noteMismatch, publish]);

  const setMode = useCallback(
    (next: DrawMode) => {
      pendingMode.current = next;
      const draw = drawRef.current;
      if (!draw?.enabled) {
        setModeState(next);
        setIsDrawing(false);
        return;
      }
      draw.setMode(next);
      publish(draw);
    },
    [publish],
  );

  const undo = useCallback(() => {
    const draw = drawRef.current;
    if (!draw?.enabled) return;
    draw.undo();
    publish(draw);
  }, [publish]);

  const redo = useCallback(() => {
    const draw = drawRef.current;
    if (!draw?.enabled) return;
    draw.redo();
    publish(draw);
  }, [publish]);

  const reset = useCallback(() => {
    pendingMode.current = DRAW_MODE;
    const draw = drawRef.current;
    if (!draw?.enabled) {
      setModeState(DRAW_MODE);
      setIsDrawing(false);
      setRouteGeoJSON(null);
      setEndpointSubstations(NO_SUBSTATIONS);
      setTerminalEndsOk(true);
      lastMismatchRef.current = null;
      return;
    }
    draw.clear();
    draw.clearUndoRedoHistory();
    draw.setMode(DRAW_MODE);
    setModeState(DRAW_MODE);
    setIsDrawing(false);
    setRouteGeoJSON(null);
    setEndpointSubstations(NO_SUBSTATIONS);
    setTerminalEndsOk(true);
    lastMismatchRef.current = null;
  }, []);

  return {
    mode,
    setMode,
    routeGeoJSON,
    endpointSubstations,
    terminalEndsOk,
    undo,
    redo,
    reset,
    isDrawing,
  };
}
