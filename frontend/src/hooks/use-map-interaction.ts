import { useEffect, useRef } from 'react';
import { Popup } from 'maplibre-gl';
import type {
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  MapMouseEvent,
} from 'maplibre-gl';
import { MAP_OVERLAYS } from '@/components/map/RouteMap';
import { STATEFP_TO_ABBR, VOLTAGE_STYLES } from '@/data/color-maps';

const INTERACTIVE_LAYER_IDS: readonly string[] = MAP_OVERLAYS.map((overlay) => overlay.id);
const SQ_METERS_PER_SQ_MILE = 2589988;
const POPUP_FONT = 'system-ui, sans-serif';

interface HoverTarget {
  source: string;
  sourceLayer: string;
  id: string | number;
}

type FeatureProps = MapGeoJSONFeature['properties'];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function prop(properties: FeatureProps, key: string): string {
  const value = properties[key];
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function stateAbbr(statefp: string): string {
  if (!statefp) return '';
  const padded = statefp.padStart(2, '0');
  return STATEFP_TO_ABBR[padded] ?? STATEFP_TO_ABBR[statefp] ?? '';
}

function voltageLabel(voltClass: string): string {
  if (!voltClass) return '';
  const key = voltClass.toLowerCase();
  const match = VOLTAGE_STYLES.find((style) => style.voltClass.toLowerCase() === key);
  return match?.label ?? voltClass;
}

function formatVoltage(raw: string): string {
  if (!raw) return '—';
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return '—';
  return `${Math.round(value).toLocaleString('en-US')} kV`;
}

function formatLandArea(raw: string): string {
  if (!raw) return '—';
  const meters = Number(raw);
  if (!Number.isFinite(meters)) return '—';
  const sqMi = Math.round(meters / SQ_METERS_PER_SQ_MILE);
  return `${sqMi.toLocaleString('en-US')} sq mi`;
}

function countyTooltip(properties: FeatureProps): string {
  const name = prop(properties, 'namelsad') || 'County';
  const abbr = stateAbbr(prop(properties, 'statefp'));
  return abbr ? `${name}, ${abbr}` : name;
}

function corridorTooltip(properties: FeatureProps): string {
  const label = voltageLabel(prop(properties, 'volt_class')) || 'Corridor';
  const type = prop(properties, 'type');
  const owner = prop(properties, 'owner');
  const parts = [label];
  if (type) parts.push(type);
  if (owner) parts.push(owner);
  return parts.join(' · ');
}

function gridTooltip(properties: FeatureProps): string {
  return prop(properties, 'subregion') || 'Grid region';
}

function tooltipText(feature: MapGeoJSONFeature): string {
  switch (feature.layer.id) {
    case 'ref.counties_tiger':
      return countyTooltip(feature.properties);
    case 'ref.corridors_hifld':
      return corridorTooltip(feature.properties);
    case 'ref.subregions_egrid':
      return gridTooltip(feature.properties);
    default:
      return '';
  }
}

function inspectRow(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:12px;"><span style="color:#64748b;">${escapeHtml(label)}</span><span style="font-weight:500;text-align:right;">${escapeHtml(value || '—')}</span></div>`;
}

function inspectCard(title: string, rows: ReadonlyArray<readonly [string, string]>): string {
  const body = rows.map(([label, value]) => inspectRow(label, value)).join('');
  return `<div style="font-family:${POPUP_FONT};font-size:13px;line-height:1.45;color:#0f172a;min-width:180px;"><div style="font-weight:600;margin-bottom:6px;">${escapeHtml(title)}</div><div style="display:grid;gap:2px;">${body}</div></div>`;
}

function tooltipHtml(text: string): string {
  return `<div style="font-family:${POPUP_FONT};font-size:12px;font-weight:600;line-height:1.3;color:#0f172a;">${escapeHtml(text)}</div>`;
}

function inspectHtml(feature: MapGeoJSONFeature): string {
  const properties = feature.properties;
  switch (feature.layer.id) {
    case 'ref.counties_tiger': {
      const name = prop(properties, 'namelsad') || 'County';
      const abbr = stateAbbr(prop(properties, 'statefp'));
      return inspectCard(abbr ? `${name}, ${abbr}` : name, [
        ['Name', name],
        ['State', abbr || '—'],
        ['GEOID', prop(properties, 'geoid') || '—'],
        ['Land area', formatLandArea(prop(properties, 'aland'))],
      ]);
    }
    case 'ref.corridors_hifld': {
      const voltClass = prop(properties, 'volt_class');
      const label = voltageLabel(voltClass);
      return inspectCard(label || 'Corridor', [
        ['Voltage', formatVoltage(prop(properties, 'voltage'))],
        ['Volt class', voltClass || '—'],
        ['Type', prop(properties, 'type') || '—'],
        ['Status', prop(properties, 'status') || '—'],
        ['Owner', prop(properties, 'owner') || '—'],
        ['Source', prop(properties, 'source') || '—'],
      ]);
    }
    case 'ref.subregions_egrid': {
      const code = prop(properties, 'subregion') || '—';
      return inspectCard(code, [['Subregion', code]]);
    }
    default:
      return '';
  }
}

function hoverTarget(feature: MapGeoJSONFeature): HoverTarget | null {
  if (feature.id == null || feature.id === '') return null;
  return {
    source: feature.source,
    sourceLayer: feature.sourceLayer ?? feature.layer.id,
    id: feature.id,
  };
}

function sameTarget(left: HoverTarget | null, right: HoverTarget | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.source === right.source && left.sourceLayer === right.sourceLayer && left.id === right.id;
}

function styleReady(map: MapLibreMap): boolean {
  return map.isStyleLoaded() === true;
}

function topFeature(map: MapLibreMap, point: MapMouseEvent['point']): MapGeoJSONFeature | null {
  if (!overlaysReady(map)) return null;
  const hits = map.queryRenderedFeatures(point, { layers: [...INTERACTIVE_LAYER_IDS] });
  return hits[0] ?? null;
}

function overlaysReady(map: MapLibreMap): boolean {
  return styleReady(map) && INTERACTIVE_LAYER_IDS.every((id) => Boolean(map.getLayer(id)));
}

export function useMapInteraction(map: MapLibreMap | null, isDrawing: boolean): void {
  const isDrawingRef = useRef(isDrawing);
  const hoveredRef = useRef<HoverTarget | null>(null);
  const hoverPopupRef = useRef<Popup | null>(null);
  const inspectPopupRef = useRef<Popup | null>(null);
  const tooltipKeyRef = useRef('');
  isDrawingRef.current = isDrawing;

  useEffect(() => {
    if (!isDrawing || !map) return;
    hoverPopupRef.current?.remove();
    inspectPopupRef.current?.remove();
    tooltipKeyRef.current = '';
    map.getCanvas().style.cursor = '';
  }, [isDrawing, map]);

  useEffect(() => {
    if (!map) return;

    const clearHoverState = (): void => {
      const prev = hoveredRef.current;
      hoveredRef.current = null;
      if (!prev || !map.getLayer(prev.sourceLayer)) return;
      map.setFeatureState(
        { source: prev.source, sourceLayer: prev.sourceLayer, id: prev.id },
        { hover: false },
      );
    };

    const setHoverState = (feature: MapGeoJSONFeature): void => {
      const next = hoverTarget(feature);
      if (sameTarget(hoveredRef.current, next)) return;
      clearHoverState();
      hoveredRef.current = next;
      if (!next || !map.getLayer(next.sourceLayer)) return;
      map.setFeatureState(
        { source: next.source, sourceLayer: next.sourceLayer, id: next.id },
        { hover: true },
      );
    };

    const hideTooltip = (): void => {
      hoverPopupRef.current?.remove();
      tooltipKeyRef.current = '';
      map.getCanvas().style.cursor = '';
    };

    const showTooltip = (feature: MapGeoJSONFeature): void => {
      const text = tooltipText(feature);
      if (!text) {
        hideTooltip();
        return;
      }
      const html = tooltipHtml(text);
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
      const key = `${feature.layer.id}:${feature.id ?? ''}:${text}`;
      if (tooltipKeyRef.current !== key || !popup.isOpen()) {
        popup.setHTML(html);
        tooltipKeyRef.current = key;
      }
      if (!popup.isOpen()) popup.trackPointer().addTo(map);
      map.getCanvas().style.cursor = 'pointer';
    };

    const presentHover = (feature: MapGeoJSONFeature): void => {
      setHoverState(feature);
      showTooltip(feature);
    };

    const closeInspect = (): void => {
      inspectPopupRef.current?.remove();
      inspectPopupRef.current = null;
    };

    const openInspect = (feature: MapGeoJSONFeature, lngLat: MapMouseEvent['lngLat']): void => {
      const html = inspectHtml(feature);
      if (!html) return;
      closeInspect();
      inspectPopupRef.current = new Popup({
        closeButton: true,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        className: 'forge-map-inspect',
        maxWidth: '320px',
      })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(map);
    };

    const onEnter = (): void => {
      if (isDrawingRef.current) return;
      map.getCanvas().style.cursor = 'pointer';
    };

    const onMove = (event: MapLayerMouseEvent): void => {
      if (isDrawingRef.current) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const top = topFeature(map, event.point);
      if (!top || feature.layer.id !== top.layer.id) return;
      presentHover(top);
    };

    const onLeave = (event: MapLayerMouseEvent): void => {
      if (isDrawingRef.current) return;
      const top = topFeature(map, event.point);
      if (!top) {
        clearHoverState();
        hideTooltip();
        return;
      }
      presentHover(top);
    };

    const onFeatureClick = (event: MapLayerMouseEvent): void => {
      if (isDrawingRef.current) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const top = topFeature(map, event.point);
      if (!top || feature.layer.id !== top.layer.id) return;
      openInspect(top, event.lngLat);
    };

    const onBackgroundClick = (event: MapMouseEvent): void => {
      if (isDrawingRef.current) return;
      if (topFeature(map, event.point)) return;
      closeInspect();
    };

    let detach: (() => void) | null = null;

    const bind = (): void => {
      if (detach || !overlaysReady(map)) return;
      for (const layerId of INTERACTIVE_LAYER_IDS) {
        map.on('mouseenter', layerId, onEnter);
        map.on('mousemove', layerId, onMove);
        map.on('mouseleave', layerId, onLeave);
        map.on('click', layerId, onFeatureClick);
      }
      map.on('click', onBackgroundClick);
      detach = () => {
        for (const layerId of INTERACTIVE_LAYER_IDS) {
          map.off('mouseenter', layerId, onEnter);
          map.off('mousemove', layerId, onMove);
          map.off('mouseleave', layerId, onLeave);
          map.off('click', layerId, onFeatureClick);
        }
        map.off('click', onBackgroundClick);
      };
    };

    bind();
    map.on('idle', bind);
    map.on('style.load', bind);

    return () => {
      map.off('idle', bind);
      map.off('style.load', bind);
      detach?.();
      try {
        clearHoverState();
        hoverPopupRef.current?.remove();
        inspectPopupRef.current?.remove();
        map.getCanvas().style.cursor = '';
      } catch {
        // RouteMap may already have called map.remove().
      }
      hoverPopupRef.current = null;
      inspectPopupRef.current = null;
      tooltipKeyRef.current = '';
    };
  }, [map]);
}
