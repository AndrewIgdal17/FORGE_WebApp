import { useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const BUTTON =
  'absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-sm hover:bg-white';

export interface ResetButtonProps {
  visible: boolean;
  onReset: () => void;
}

function stopMapPointer(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function ResetButton({ visible, onReset }: ResetButtonProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        className={BUTTON}
        onClick={() => setOpen(true)}
        onPointerDown={stopMapPointer}
      >
        <RotateCcw className="size-4" />
        Reset
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Clear the entire route?"
        description="This removes the drawn route from the map."
        confirmLabel="Clear route"
        variant="destructive"
        onConfirm={onReset}
      />
    </>
  );
}
