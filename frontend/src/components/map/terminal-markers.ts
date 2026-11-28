import { Marker, type Map as MapLibreMap } from 'maplibre-gl';

export interface TerminalMarkerSpec {
  role: 'sending' | 'receiving';
  name: string;
  point: [number, number];
}

/** Right-click on a pin: the terminal's role and the pointer position in client pixels. */
export type TerminalContextMenuHandler = (
  role: TerminalMarkerSpec['role'],
  clientPoint: { x: number; y: number },
) => void;

const PIN_COLOR: Record<TerminalMarkerSpec['role'], string> = {
  sending: '#1d4ed8',
  receiving: '#b45309',
};

function isPair(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function markerElement(
  terminal: TerminalMarkerSpec,
  onContextMenu?: TerminalContextMenuHandler,
): HTMLDivElement {
  const root = document.createElement('div');
  root.dataset.terminalRole = terminal.role;
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';
  root.style.pointerEvents = 'none';

  const label = document.createElement('div');
  label.textContent = terminal.name;
  label.style.marginBottom = '4px';
  label.style.maxWidth = '220px';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.whiteSpace = 'nowrap';
  label.style.borderRadius = '4px';
  label.style.background = 'rgba(15, 23, 42, 0.92)';
  label.style.padding = '2px 6px';
  label.style.color = '#fff';
  label.style.fontSize = '12px';
  label.style.lineHeight = '16px';

  const pin = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pin.setAttribute('width', '18');
  pin.setAttribute('height', '26');
  pin.setAttribute('viewBox', '0 0 18 26');
  pin.setAttribute('aria-hidden', 'true');
  // The root is click-through; only the pin takes pointer events, so the label never blocks the map.
  pin.style.pointerEvents = 'auto';
  pin.style.cursor = 'context-menu';
  if (onContextMenu) {
    pin.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onContextMenu(terminal.role, { x: event.clientX, y: event.clientY });
    });
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 25 L2 11 A7 7 0 1 1 16 11 Z');
  path.setAttribute('fill', PIN_COLOR[terminal.role]);
  path.setAttribute('stroke', '#ffffff');
  path.setAttribute('stroke-width', '1.5');
  pin.append(path);

  root.append(label, pin);
  root.setAttribute('aria-label', `${terminal.role} terminal ${terminal.name}`);
  return root;
}

/** Draw pinned, labelled terminal markers. Returns a cleanup that removes them. */
export function syncTerminalMarkers(
  map: MapLibreMap,
  terminals: readonly TerminalMarkerSpec[],
  onContextMenu?: TerminalContextMenuHandler,
): () => void {
  const markers: Marker[] = [];
  for (const terminal of terminals) {
    if (!isPair(terminal.point)) continue;
    const marker = new Marker({ element: markerElement(terminal, onContextMenu), anchor: 'bottom' })
      .setLngLat(terminal.point)
      .addTo(map);
    markers.push(marker);
  }
  return () => {
    for (const marker of markers) marker.remove();
  };
}
