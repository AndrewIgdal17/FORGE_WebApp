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
import type { GeoJSONStoreFeatures, TerraDrawEventListeners } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';

type FeatureId = string | number;

export type DrawMode = 'linestring' | 'select';

export interface RouteDraw {
  mode: DrawMode;
  setMode: (mode: DrawMode) => void;
  routeGeoJSON: MultiLineString | null;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  isDrawing: boolean;
}

const ROUTE_BLUE = '#3b82f6' as const;
const ROUTE_WHITE = '#ffffff' as const;
const DRAW_MODE: DrawMode = 'linestring';
const EDIT_MODE: DrawMode = 'select';

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
  return new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawLineStringMode({
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
      return;
    }
    draw.clear();
    draw.clearUndoRedoHistory();
    draw.setMode(DRAW_MODE);
    setModeState(DRAW_MODE);
    setIsDrawing(false);
    setRouteGeoJSON(null);
  }, []);

  return { mode, setMode, routeGeoJSON, undo, redo, reset, isDrawing };
}
