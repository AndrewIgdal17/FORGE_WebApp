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

type FeatureId = string | number;

export type DrawMode = 'linestring' | 'select';

export interface SubstationIdentity {
  gid: number;
  name: string | null;
  max_volt: string | null;
}

export interface EndpointSubstations {
  sending: SubstationIdentity | null;
  receiving: SubstationIdentity | null;
}

export interface RouteDraw {
  mode: DrawMode;
  setMode: (mode: DrawMode) => void;
  routeGeoJSON: MultiLineString | null;
  endpointSubstations: EndpointSubstations;
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

function substationSnapTarget(
  map: MapLibreMap,
  x: number,
  y: number,
): Position | undefined {
  if (map.isStyleLoaded() !== true || !map.getLayer(SUBSTATION_HIT_LAYER)) return undefined;
  const features = map.queryRenderedFeatures(
    [
      [x - HIT_PADDING_PX, y - HIT_PADDING_PX],
      [x + HIT_PADDING_PX, y + HIT_PADDING_PX],
    ],
    { layers: [SUBSTATION_HIT_LAYER] },
  );
  for (const feature of features) {
    if (feature.geometry.type !== 'Point') continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    return [longitude, latitude];
  }
  return undefined;
}

function substationAt(map: MapLibreMap, position: Position): SubstationIdentity | null {
  if (!map.getLayer(SUBSTATION_HIT_LAYER)) return null;
  const longitude = position[0];
  const latitude = position[1];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const point = map.project([longitude, latitude]);
  const features = map.queryRenderedFeatures(
    [
      [point.x - HIT_PADDING_PX, point.y - HIT_PADDING_PX],
      [point.x + HIT_PADDING_PX, point.y + HIT_PADDING_PX],
    ],
    { layers: [SUBSTATION_HIT_LAYER] },
  );
  const feature = features[0];
  if (!feature) return null;
  const properties = feature.properties ?? {};
  const gid = gidProp(properties.gid) ?? gidProp(feature.id);
  if (gid === null) return null;
  return {
    gid,
    name: textProp(properties.name),
    max_volt: textProp(properties.max_volt),
  };
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

function readDrawing(draw: TerraDraw): boolean {
  return draw.getMode() === DRAW_MODE && draw.getModeState() === 'drawing';
}

function createDraw(map: MapLibreMap): TerraDraw {
  const toCustom: SnapToCustom = (event) =>
    substationSnapTarget(map, event.containerX, event.containerY);

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

export function useRouteDraw(map: MapLibreMap | null): RouteDraw {
  const drawRef = useRef<TerraDraw | null>(null);
  const pendingMode = useRef<DrawMode>(DRAW_MODE);
  const [mode, setModeState] = useState<DrawMode>(DRAW_MODE);
  const [routeGeoJSON, setRouteGeoJSON] = useState<MultiLineString | null>(null);
  const [endpointSubstations, setEndpointSubstations] =
    useState<EndpointSubstations>(NO_SUBSTATIONS);
  const [isDrawing, setIsDrawing] = useState(false);

  const publish = useCallback((draw: TerraDraw) => {
    const current = draw.getMode();
    setModeState(isDrawMode(current) ? current : DRAW_MODE);
    setIsDrawing(readDrawing(draw));
    const nextRoute = routeGeometry(draw);
    setRouteGeoJSON((currentRoute) => (sameRoute(currentRoute, nextRoute) ? currentRoute : nextRoute));
  }, []);

  useEffect(() => {
    if (!map) return;

    let cancelled = false;
    let adjusting = false;
    const draw = createDraw(map);
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

    const onFinish: TerraDrawEventListeners['finish'] = (_id, context) => {
      queueMicrotask(() => {
        if (cancelled || !draw.enabled) return;
        rejectExtraLines();
        if (context.action === 'draw' && context.mode === DRAW_MODE) {
          focusFinishedLine();
        }
        const route = routeGeometry(draw);
        setEndpointSubstations(route ? substationsFor(map, route) : NO_SUBSTATIONS);
        publish(draw);
      });
    };

    const onChange: TerraDrawEventListeners['change'] = (_ids, type) => {
      if (cancelled || adjusting || type === 'styling') return;
      if (draw.getMode() === EDIT_MODE) {
        publish(draw);
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
  }, [map, publish]);

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
      return;
    }
    draw.clear();
    draw.clearUndoRedoHistory();
    draw.setMode(DRAW_MODE);
    setModeState(DRAW_MODE);
    setIsDrawing(false);
    setRouteGeoJSON(null);
    setEndpointSubstations(NO_SUBSTATIONS);
  }, []);

  return { mode, setMode, routeGeoJSON, endpointSubstations, undo, redo, reset, isDrawing };
}
