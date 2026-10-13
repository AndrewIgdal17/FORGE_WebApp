import type { ReactElement, SyntheticEvent } from 'react';
import { MousePointer2, Pencil, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DrawMode } from '@/hooks/use-route-draw';

const PANEL =
  'absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-sm';

export interface DrawingToolbarProps {
  mode: DrawMode;
  onMode: (mode: DrawMode) => void;
  onUndo: () => void;
  onRedo: () => void;
}

function stopMapPointer(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function DrawingToolbar({ mode, onMode, onUndo, onRedo }: DrawingToolbarProps): ReactElement {
  return (
    <div className={PANEL} role="toolbar" aria-label="Route drawing" onPointerDown={stopMapPointer}>
      <Button
        type="button"
        size="icon"
        variant={mode === 'linestring' ? 'default' : 'outline'}
        aria-pressed={mode === 'linestring'}
        aria-label="Draw"
        title="Draw"
        onClick={() => onMode('linestring')}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={mode === 'select' ? 'default' : 'outline'}
        aria-pressed={mode === 'select'}
        aria-label="Edit"
        title="Edit"
        onClick={() => onMode('select')}
      >
        <MousePointer2 />
      </Button>
      <Button type="button" size="icon" variant="outline" aria-label="Undo" title="Undo" onClick={onUndo}>
        <Undo2 />
      </Button>
      <Button type="button" size="icon" variant="outline" aria-label="Redo" title="Redo" onClick={onRedo}>
        <Redo2 />
      </Button>
    </div>
  );
}
