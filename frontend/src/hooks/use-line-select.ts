import { useCallback, useEffect, useRef, useState } from 'react';
import { Popup } from 'maplibre-gl';
import type {
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  MapMouseEvent,
} from 'maplibre-gl';
import { hitLayerId } from '@/components/map/RouteMap';
import {
  hoverCorridorGidFilter,
  lineSelectTooltip,
  overlappingCandidates,
  startTrace,
  toggleGid,
  traceStep,
  type LineTrace,
  type CorridorCandidate,
} from '@/lib/line-select';

const CORRIDOR_HIT = hitLayerId('ref.corridors');
const SELECTED_SOURCE = 'forge-line-selected';
const SELECTED_LAYER = 'forge-line-selected-highlight';
const HOVER_LAYER = 'forge-line-hover-highlight';
const TRACE_START_RADIUS_PX = 24;
const TRACE_MOVE_THRESHOLD_PX = 4;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function propString(properties: MapGeoJSONFeature['properties'], key: string): string | null {
  const value = properties[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function propNumber(properties: MapGeoJSONFeature['properties'], key: string): number | null {
  const primary = properties[key];
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  const asString = propString(properties, key);
  if (!asString) return null;
  const parsed = Number(asString);
  return Number.isFinite(parsed) ? parsed : null;
}

export function corridorCandidateFromFeature(feature: MapGeoJSONFeature): CorridorCandidate | null {
  const gid = propNumber(feature.properties, 'gid');
  if (gid === null) return null;
  const voltage_kv =
    propNumber(feature.properties, 'voltage_kv') ??
    propNumber(feature.properties, 'voltage');
  return {
    gid,
    voltage_kv,
    sub_1: propString(feature.properties, 'sub_1'),
    sub_2: propString(feature.properties, 'sub_2'),
    source: propString(feature.properties, 'source') ?? '',
    circuits: propNumber(feature.properties, 'circuits'),
  };
}

function ensureSelectedLayers(map: MapLibreMap): void {
  if (!map.getSource(SELECTED_SOURCE)) {
    map.addSource(SELECTED_SOURCE, {
      type: 'vector',
      url: 'https://tiles.forge-calc.com/ref.corridors',
      promoteId: 'gid',
    });
  }
  if (!map.getLayer(SELECTED_LAYER)) {
    map.addLayer({
      id: SELECTED_LAYER,
      type: 'line',
      source: SELECTED_SOURCE,
      'source-layer': 'ref.corridors',
      filter: ['in', ['get', 'gid'], ['literal', [] as number[]]],
      paint: {
        'line-color': '#2563eb',
        'line-width': 5,
        'line-opacity': 0.95,
      },
    });
  }
}

function syncSelectedFilter(map: MapLibreMap, gids: number[]): void {
  if (!map.getLayer(SELECTED_LAYER)) return;
  map.setFilter(SELECTED_LAYER, ['in', ['get', 'gid'], ['literal', [...gids]]]);
  map.setLayoutProperty(SELECTED_LAYER, 'visibility', gids.length > 0 ? 'visible' : 'none');
}

function ensureHoverLayer(map: MapLibreMap): void {
  if (!map.getSource(SELECTED_SOURCE)) {
    map.addSource(SELECTED_SOURCE, {
      type: 'vector',
      url: 'https://tiles.forge-calc.com/ref.corridors',
      promoteId: 'gid',
    });
  }
  if (!map.getLayer(HOVER_LAYER)) {
    map.addLayer({
      id: HOVER_LAYER,
      type: 'line',
      source: SELECTED_SOURCE,
      'source-layer': 'ref.corridors',
      filter: hoverCorridorGidFilter(null),
      paint: {
        'line-color': '#f59e0b',
        'line-width': 6,
        'line-opacity': 0.95,
      },
    });
    map.setLayoutProperty(HOVER_LAYER, 'visibility', 'none');
  }
}

function syncHoverFilter(map: MapLibreMap, gid: number | null): void {
  if (!map.getLayer(HOVER_LAYER)) return;
  map.setFilter(HOVER_LAYER, hoverCorridorGidFilter(gid));
  map.setLayoutProperty(HOVER_LAYER, 'visibility', gid === null ? 'none' : 'visible');
}

export interface UseLineSelectOptions {
  active: boolean;
  selectedGids: number[];
  /** `added` is the candidate just selected; absent when a piece was removed. */
  onSelectedGids: (gids: number[], added?: CorridorCandidate) => void;
  onPickerOpen: (candidates: CorridorCandidate[]) => void;
  /** Right-click on a selected piece; the caller opens the piece menu at the client point. */
  onPieceContextMenu?: (gid: number, clientPoint: { x: number; y: number }) => void;
  /** Called with each corridor piece the pointer hovers or clicks, so its details can be kept. */
  onPieceSeen?: (candidate: CorridorCandidate) => void;
  /** The sending terminal; a drag that starts on or near it traces the line from there. */
  traceStart?: [number, number] | null;
}

export function useLineSelect(
  map: MapLibreMap | null,
  options: UseLineSelectOptions,
): { hoveredGid: number | null } {
  const {
    active,
    selectedGids,
    onSelectedGids,
    onPickerOpen,
    onPieceContextMenu,
    onPieceSeen,
    traceStart = null,
  } = options;
  const traceStartRef = useRef(traceStart);
  traceStartRef.current = traceStart;
  const activeRef = useRef(active);
  const onPieceContextMenuRef = useRef(onPieceContextMenu);
  onPieceContextMenuRef.current = onPieceContextMenu;
  const onPieceSeenRef = useRef(onPieceSeen);
  onPieceSeenRef.current = onPieceSeen;
  const selectedRef = useRef(selectedGids);
  const hoverPopupRef = useRef<Popup | null>(null);
  const hoveredGidRef = useRef<number | null>(null);
  const [hoveredGid, setHoveredGid] = useState<number | null>(null);
  // Drag trace (test version): pieces picked up while the mouse is held down.
  const traceRef = useRef<{
    trace: LineTrace;
    base: number[];
    start: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const onSelectedGidsRef = useRef(onSelectedGids);
  onSelectedGidsRef.current = onSelectedGids;
  activeRef.current = active;
  selectedRef.current = selectedGids;

  const toggle = useCallback(
    (candidate: CorridorCandidate) => {
      const current = selectedRef.current;
      const added = current.includes(candidate.gid) ? undefined : candidate;
      onSelectedGids(toggleGid(current, candidate.gid), added);
    },
    [onSelectedGids],
  );

  useEffect(() => {
    if (!map) return;
    const install = (): void => {
      if (!map.getLayer(CORRIDOR_HIT)) return;
      ensureSelectedLayers(map);
      ensureHoverLayer(map);
      syncSelectedFilter(map, selectedRef.current);
      syncHoverFilter(map, hoveredGidRef.current);
    };
    install();
    map.on('idle', install);
    map.on('style.load', install);
    return () => {
      map.off('idle', install);
      map.off('style.load', install);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    syncSelectedFilter(map, selectedGids);
  }, [map, selectedGids]);

  useEffect(() => {
    if (!map || !active) {
      hoverPopupRef.current?.remove();
      hoveredGidRef.current = null;
      setHoveredGid(null);
      if (map) syncHoverFilter(map, null);
      return;
    }

    const hideTooltip = (): void => {
      hoverPopupRef.current?.remove();
      hoveredGidRef.current = null;
      setHoveredGid(null);
      syncHoverFilter(map, null);
      map.getCanvas().style.cursor = '';
    };

    const showTooltip = (candidate: CorridorCandidate, lngLat: MapMouseEvent['lngLat']): void => {
      const text = lineSelectTooltip(candidate);
      let popup = hoverPopupRef.current;
      if (!popup) {
        popup = new Popup({
          closeButton: false,
          closeOnClick: false,
          closeOnMove: false,
          focusAfterOpen: false,
          className: 'forge-map-tooltip',
          maxWidth: '320px',
        });
        hoverPopupRef.current = popup;
      }
      popup
        .setLngLat(lngLat)
        .setHTML(
          `<div style="font-family:system-ui,sans-serif;font-size:12px;font-weight:600;line-height:1.3;color:#0f172a;">${escapeHtml(text)}</div>`,
        )
        .addTo(map);
      map.getCanvas().style.cursor = 'pointer';
      hoveredGidRef.current = candidate.gid;
      setHoveredGid(candidate.gid);
      syncHoverFilter(map, candidate.gid);
    };

    const corridorFeatures = (point: MapMouseEvent['point']): MapGeoJSONFeature[] => {
      if (!map.getLayer(CORRIDOR_HIT)) return [];
      return map.queryRenderedFeatures(point, { layers: [CORRIDOR_HIT] });
    };

    const onMove = (event: MapLayerMouseEvent): void => {
      if (!activeRef.current) return;
      const features = corridorFeatures(event.point);
      const candidates = overlappingCandidates(
        features
          .map((feature) => corridorCandidateFromFeature(feature))
          .filter((row): row is CorridorCandidate => row !== null),
      );
      const top = candidates[0];
      // A crosshair shows the piece can be clicked or traced.
      map.getCanvas().style.cursor = top ? 'crosshair' : '';
      if (!top) {
        hideTooltip();
        return;
      }
      for (const candidate of candidates) onPieceSeenRef.current?.(candidate);
      if (hoveredGidRef.current === top.gid && hoverPopupRef.current?.isOpen()) return;
      showTooltip(top, event.lngLat);
    };

    const onLeave = (): void => {
      map.getCanvas().style.cursor = '';
      hideTooltip();
    };

    const candidatesAt = (features: MapGeoJSONFeature[]): CorridorCandidate[] =>
      overlappingCandidates(
        features
          .map((feature) => corridorCandidateFromFeature(feature))
          .filter((row): row is CorridorCandidate => row !== null),
      );

    const applyTraceAdds = (added: CorridorCandidate[]): void => {
      const current = traceRef.current;
      if (!current || added.length === 0) return;
      for (const candidate of added) onPieceSeenRef.current?.(candidate);
      const merged = [...current.base];
      for (const gid of current.trace.gids) if (!merged.includes(gid)) merged.push(gid);
      onSelectedGidsRef.current(merged, added[added.length - 1]);
    };

    const containerPoint = (event: MouseEvent): { x: number; y: number } => {
      const rect = map.getContainer().getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    // A trace starts on the sending terminal or on any line piece. Map panning
    // is switched off before MapLibre sees the press, so the drag traces instead.
    const onTraceDown = (event: MouseEvent): void => {
      if (!activeRef.current || !map.getLayer(CORRIDOR_HIT)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const point = containerPoint(event);
      const start = traceStartRef.current;
      let nearSending = false;
      if (start) {
        const pin = map.project(start);
        nearSending = Math.hypot(pin.x - point.x, pin.y - point.y) <= TRACE_START_RADIUS_PX;
      }
      const onPiece =
        map.queryRenderedFeatures([point.x, point.y], { layers: [CORRIDOR_HIT] }).length > 0;
      if (!nearSending && !onPiece) return;
      traceRef.current = { trace: startTrace(), base: [...selectedRef.current], start: point, moved: false };
      map.dragPan.disable();
    };

    const onTraceMove = (event: MouseEvent): void => {
      const current = traceRef.current;
      if (!current || !map.getLayer(CORRIDOR_HIT)) return;
      const { x, y } = containerPoint(event);
      if (!current.moved) {
        if (Math.hypot(x - current.start.x, y - current.start.y) < TRACE_MOVE_THRESHOLD_PX) return;
        current.moved = true;
      }
      const features = map.queryRenderedFeatures(
        [
          [x - 4, y - 4],
          [x + 4, y + 4],
        ],
        { layers: [CORRIDOR_HIT] },
      );
      const step = traceStep(current.trace, candidatesAt(features));
      if (step.added.length === 0) return;
      traceRef.current = { ...current, trace: step.trace };
      applyTraceAdds(step.added);
    };

    const onTraceEnd = (): void => {
      const current = traceRef.current;
      if (!current) return;
      traceRef.current = null;
      map.dragPan.enable();
      // A real drag must not also count as a click on the piece under the cursor.
      if (current.moved) suppressClickRef.current = true;
    };

    const onClick = (event: MapLayerMouseEvent): void => {
      if (!activeRef.current) return;
      event.preventDefault();
      if (suppressClickRef.current) {
        // The mousedown that started a trace already selected the piece.
        suppressClickRef.current = false;
        return;
      }
      const features = corridorFeatures(event.point);
      const candidates = overlappingCandidates(
        features
          .map((feature) => corridorCandidateFromFeature(feature))
          .filter((row): row is CorridorCandidate => row !== null),
      );
      if (candidates.length === 0) return;
      for (const candidate of candidates) onPieceSeenRef.current?.(candidate);
      if (candidates.length === 1) {
        toggle(candidates[0]!);
        return;
      }
      onPickerOpen(candidates);
    };

    const onPieceContextMenuEvent = (event: MapLayerMouseEvent): void => {
      const original = event.originalEvent;
      original.preventDefault();
      if (!activeRef.current) return;
      const [feature] = map.queryRenderedFeatures(event.point, { layers: [SELECTED_LAYER] });
      if (!feature) return;
      const candidate = corridorCandidateFromFeature(feature);
      if (!candidate) return;
      onPieceContextMenuRef.current?.(candidate.gid, { x: original.clientX, y: original.clientY });
    };

    map.on('mousemove', CORRIDOR_HIT, onMove);
    map.on('mouseleave', CORRIDOR_HIT, onLeave);
    map.on('click', CORRIDOR_HIT, onClick);
    map.on('contextmenu', SELECTED_LAYER, onPieceContextMenuEvent);
    const container = map.getContainer();
    container.addEventListener('mousedown', onTraceDown, true);
    window.addEventListener('mousemove', onTraceMove);
    window.addEventListener('mouseup', onTraceEnd);

    return () => {
      map.off('mousemove', CORRIDOR_HIT, onMove);
      map.off('mouseleave', CORRIDOR_HIT, onLeave);
      map.off('click', CORRIDOR_HIT, onClick);
      map.off('contextmenu', SELECTED_LAYER, onPieceContextMenuEvent);
      container.removeEventListener('mousedown', onTraceDown, true);
      window.removeEventListener('mousemove', onTraceMove);
      window.removeEventListener('mouseup', onTraceEnd);
      onTraceEnd();
      hideTooltip();
    };
  }, [map, active, toggle, onPickerOpen]);

  return { hoveredGid };
}
