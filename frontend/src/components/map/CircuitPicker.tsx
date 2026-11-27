import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CorridorCandidate } from '@/lib/line-select';
import { lineSelectTooltip } from '@/lib/line-select';

export interface CircuitPickerProps {
  open: boolean;
  candidates: CorridorCandidate[];
  onChoose: (candidate: CorridorCandidate) => void;
  onClose: () => void;
}

function circuitLabel(candidate: CorridorCandidate): string {
  const circuits =
    candidate.circuits !== null && candidate.circuits > 0
      ? `${candidate.circuits} circuit${candidate.circuits === 1 ? '' : 's'}`
      : null;
  const parts = [lineSelectTooltip(candidate)];
  if (circuits) parts.push(circuits);
  return parts.join(' · ');
}

export function CircuitPicker({
  open,
  candidates,
  onChoose,
  onClose,
}: CircuitPickerProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md" onPointerDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Choose a circuit</DialogTitle>
        </DialogHeader>
        <ul className="grid gap-2">
          {candidates.map((candidate) => (
            <li key={candidate.gid}>
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                onClick={() => onChoose(candidate)}
              >
                {circuitLabel(candidate)}
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}