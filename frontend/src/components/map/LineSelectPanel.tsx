import { useState } from 'react';
import type { ReactElement, SyntheticEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AssembleLinePiece, LineConnector } from '@/lib/api';
import {
  pieceLabel,
  selectionSummary,
  UNKNOWN_PIECE_DETAILS,
  type PieceDetails,
} from '@/lib/line-select';

// Bottom-left, above the map legend chip (bottom-16); the Layers panel owns top-right.
export const LINE_SELECT_PANEL_CLASS =
  'absolute bottom-28 left-4 z-10 w-80 max-h-[min(70vh,32rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm';
export const LINE_SELECT_COLLAPSED_CLASS =
  'absolute bottom-28 left-4 z-10 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-sm';

function stopMapPointer(event: SyntheticEvent): void {
  event.stopPropagation();
}

export interface LineSelectPanelProps {
  selectedGids: number[];
  /** Voltage and names for each selected gid, from the clicked map features. */
  pieceDetails: Record<number, PieceDetails>;
  pieces: AssembleLinePiece[];
  connectors: LineConnector[];
  summary: string | null;
  assembleError: string | null;
  assembling: boolean;
  onRemove: (gid: number) => void;
  onUseLine: () => void;
}

export function LineSelectPanel({
  selectedGids,
  pieceDetails,
  pieces,
  connectors,
  summary,
  assembleError,
  assembling,
  onRemove,
  onUseLine,
}: LineSelectPanelProps): ReactElement | null {
  const [collapsed, setCollapsed] = useState(false);
  if (selectedGids.length === 0 && !summary && !assembleError) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className={LINE_SELECT_COLLAPSED_CLASS}
        onClick={() => setCollapsed(false)}
        onPointerDown={stopMapPointer}
      >
        Line selection ({selectedGids.length})
      </button>
    );
  }

  // Restored selections carry known: false until their tile feature is seen.
  const listedPieces: Array<AssembleLinePiece & { known?: boolean }> =
    pieces.length > 0
      ? pieces
      : selectedGids.map((gid) => ({
          gid,
          voltage_kv: pieceDetails[gid]?.voltage_kv ?? null,
          sub_1: pieceDetails[gid]?.sub_1 ?? null,
          sub_2: pieceDetails[gid]?.sub_2 ?? null,
          source: '',
          miles: 0,
          known: pieceDetails[gid] !== undefined,
        }));

  return (
    <aside className={LINE_SELECT_PANEL_CLASS} aria-label="Line selection" onPointerDown={stopMapPointer}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Select line</h2>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-800"
          onClick={() => setCollapsed(true)}
        >
          Minimize
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Press on the sending substation and drag along the line to the receiving one; pieces at that line's voltage join as you pass. Click a piece to add or remove it.
      </p>
      <ol className="mt-3 grid gap-2">
        {listedPieces.map((piece, index) => (
          <li
            key={`${piece.gid}-${index}`}
            className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                {pieceLabel(piece.known === false ? UNKNOWN_PIECE_DETAILS : piece)}
              </p>
              <p className="text-xs text-slate-500">
                gid {piece.gid}
                {piece.miles > 0 ? ` · ${piece.miles.toFixed(1)} mi` : ''}
                {piece.source ? ` · ${piece.source}` : ''}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              aria-label={`Remove piece ${piece.gid}`}
              onClick={() => onRemove(piece.gid)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ol>
      {summary ? (
        <p className="mt-3 text-xs text-slate-700">{summary}</p>
      ) : connectors.length > 0 || pieces.length > 0 ? (
        <p className="mt-3 text-xs text-slate-700">
          {selectionSummary(pieces, connectors)}
        </p>
      ) : null}
      {assembleError ? (
        <p className="mt-2 text-xs break-words text-red-600">{assembleError}</p>
      ) : null}
      <Button
        type="button"
        className="mt-3 w-full"
        disabled={selectedGids.length === 0 || assembling}
        onClick={onUseLine}
      >
        {assembling ? 'Assembling…' : 'Use this line'}
      </Button>
    </aside>
  );
}