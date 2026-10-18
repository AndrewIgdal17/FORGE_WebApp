import { useCallback, useEffect, useRef, useState } from 'react';
import type { Polygon, Position } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { TerraDraw, TerraDrawPolygonMode } from 'terra-draw';
import type { GeoJSONStoreFeatures, TerraDrawEventListeners } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';

type FeatureId = string | number;

const YARD_FILL = '#2563eb';
const YARD_STROKE = '#1d4ed8';
const VERTEX_FILL = '#ffffff';
const POLYGON_MODE = 'polygon';

function featureId(feature: GeoJSONStoreFeatures): FeatureId | null {
  const id = feature.id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return null;
}

function polygonFeatures(draw: TerraDraw): GeoJSONStoreFeatures[] {
  return draw.getSnapshot().filter((feature) => feature.geometry.type === 'Polygon');
}

function isFinished(feature: GeoJSONStoreFeatures): boolean {
  return feature.properties.currentlyDrawing !== true;
}

function ringPositions(ring: Position[]): [number, number][] {
  return ring
    .filter((position) => position.length >= 2)
    .filter((position) => Number.isFinite(position[0]) && Number.isFinite(position[1]))
    .map((position): [number, number] => [position[0], position[1]]);
}

function toPolygon(feature: GeoJSONStoreFeatures): Polygon | null {
  if (feature.geometry.type !== 'Polygon' || !isFinished(feature)) return null;
  const coordinates = feature.geometry.coordinates
    .map((ring) => ringPositions(ring))
    .filter((ring) => ring.length >= 4);
  if (coordinates.length === 0) return null;
  const exterior = coordinates[0];
  const first = exterior[0];
  const last = exterior[exterior.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    exterior.push([first[0], first[1]]);
  }
  if (exterior.length < 4) return null;
  return { type: 'Polygon', coordinates };
}

function finishedPolygon(draw: TerraDraw): Polygon | null {
  const finished = polygonFeatures(draw).filter(isFinished);
  if (finished.length === 0) return null;
  return toPolygon(finished[0]);
}

function samePolygon(left: Polygon | null, right: Polygon | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left.coordinates) === JSON.stringify(right.coordinates);
}

function createDraw(map: MapLibreMap): TerraDraw {
  return new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawPolygonMode({
        styles: {
          fillColor: YARD_FILL,
          fillOpacity: 0.35,
          outlineColor: YARD_STROKE,
          outlineWidth: 2,
          closingPointColor: VERTEX_FILL,
          closingPointOutlineColor: YARD_STROKE,
          closingPointOutlineWidth: 2,
          closingPointWidth: 8,
          coordinatePointColor: VERTEX_FILL,
          coordinatePointOutlineColor: YARD_STROKE,
          coordinatePointOutlineWidth: 2,
          coordinatePointWidth: 8,
        },
      }),
    ],
  });
}

export function useAuditPolygonDraw(map: MapLibreMap | null, enabled: boolean): Polygon | null {
  const drawRef = useRef<TerraDraw | null>(null);
  const [polygon, setPolygon] = useState<Polygon | null>(null);

  const publish = useCallback((draw: TerraDraw) => {
    const next = finishedPolygon(draw);
    setPolygon((current) => (samePolygon(current, next) ? current : next));
  }, []);

  useEffect(() => {
    if (!map || !enabled) {
      setPolygon(null);
      return;
    }

    let cancelled = false;
    let adjusting = false;
    const draw = createDraw(map);
    drawRef.current = draw;

    const rejectExtraPolygons = (): boolean => {
      if (adjusting || !draw.enabled) return false;
      const polygons = polygonFeatures(draw);
      if (polygons.length <= 1) return false;
      const finished = polygons.filter(isFinished);
      const keep = finished[0] ?? polygons[0];
      const keepId = featureId(keep);
      if (keepId === null) return false;
      const removeIds = polygons
        .map(featureId)
        .filter((id): id is FeatureId => id !== null && id !== keepId);
      if (removeIds.length === 0) return false;
      adjusting = true;
      try {
        draw.removeFeatures(removeIds);
      } finally {
        adjusting = false;
      }
      return true;
    };

    const onFinish: TerraDrawEventListeners['finish'] = () => {
      queueMicrotask(() => {
        if (cancelled || !draw.enabled) return;
        rejectExtraPolygons();
        publish(draw);
      });
    };

    const onChange: TerraDrawEventListeners['change'] = (_ids, type) => {
      if (cancelled || adjusting || type === 'styling') return;
      if (type === 'create' || type === 'delete') {
        queueMicrotask(() => {
          if (cancelled || !draw.enabled) return;
          rejectExtraPolygons();
          publish(draw);
        });
        return;
      }
      publish(draw);
    };

    const begin = (): void => {
      if (cancelled || draw.enabled) return;
      draw.start();
      draw.setMode(POLYGON_MODE);
      publish(draw);
    };

    draw.on('finish', onFinish);
    draw.on('change', onChange);

    if (map.isStyleLoaded() === true) {
      begin();
    } else {
      map.on('style.load', begin);
    }

    return () => {
      cancelled = true;
      map.off('style.load', begin);
      draw.off('finish', onFinish);
      draw.off('change', onChange);
      if (draw.enabled) draw.stop();
      if (drawRef.current === draw) drawRef.current = null;
    };
  }, [map, enabled, publish]);

  return polygon;
}
