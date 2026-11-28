import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

export interface MapContextMenuItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface MapContextMenuProps {
  /** Position in the map container's pixels (top-left origin). */
  x: number;
  y: number;
  items: readonly MapContextMenuItem[];
  onClose: () => void;
}

/**
 * Small menu over the map for a right-clicked object. Closes on Esc, on a
 * press outside the menu, or after a choice. Esc is handled in the capture
 * phase and its default is prevented, so other Esc handlers (such as the
 * terminal pick step) do not also run.
 */
export function MapContextMenu({ x, y, items, onClose }: MapContextMenuProps): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  return (
    <div
      ref={menuRef}
      role="menu"
      data-map-context-menu
      className="absolute z-30 min-w-44 rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-800 shadow-lg"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-white"
          onClick={() => {
            item.onSelect?.();
            onCloseRef.current();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
