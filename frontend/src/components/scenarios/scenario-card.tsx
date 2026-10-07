import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatTimestamp } from '@/lib/format';
import type { Scenario } from '@/stores/scenario-store';

export interface ScenarioCardProps {
  scenario: Scenario;
  currentUserId: string | null;
  onOpen: (scenario: Scenario) => void;
  onRename: (scenario: Scenario) => void;
  onDuplicate: (scenario: Scenario) => void;
  onDelete: (scenario: Scenario) => void;
  onExportForge: (scenario: Scenario) => void;
  onExportCsv: (scenario: Scenario) => void;
}

function lockedReason(isSystem: boolean, action: 'rename' | 'delete'): string {
  if (isSystem) {
    return action === 'rename'
      ? 'System scenarios cannot be renamed'
      : 'System scenarios cannot be deleted';
  }
  return action === 'rename'
    ? 'Only the owner can rename this scenario'
    : 'Only the owner can delete this scenario';
}

function ExportMenu({
  scenario,
  onExportForge,
  onExportCsv,
}: {
  scenario: Scenario;
  onExportForge: (s: Scenario) => void;
  onExportCsv: (s: Scenario) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleBlur(event: React.FocusEvent): void {
    if (menuRef.current && !menuRef.current.contains(event.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={menuRef} onBlur={handleBlur}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="gap-1"
      >
        <Download className="size-3.5" />
        Export
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            role="menuitem"
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => {
              onExportForge(scenario);
              setOpen(false);
            }}
          >
            .forge (JSON)
          </button>
          <button
            role="menuitem"
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => {
              onExportCsv(scenario);
              setOpen(false);
            }}
          >
            .csv
          </button>
        </div>
      )}
    </div>
  );
}

export function ScenarioCard({
  scenario,
  currentUserId,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExportForge,
  onExportCsv,
}: ScenarioCardProps): ReactElement {
  const isSystem = scenario.source === 'system';
  const isOwner = currentUserId !== null && scenario.user_id === currentUserId;
  const canRenameOrDelete = isOwner && !isSystem;

  return (
    <Card size="sm" className="overflow-visible">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <CardTitle className="font-bold">{scenario.name}</CardTitle>
          <CardDescription className="text-xs opacity-60">
            {formatTimestamp(scenario.updated_at)}
            {scenario.ownerUsername ? ` · ${scenario.ownerUsername}` : ''}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isSystem ? (
            <Button type="button" size="sm" onClick={() => onDuplicate(scenario)}>
              Duplicate & Edit
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => onOpen(scenario)}>
              Open
            </Button>
          )}
          <span title={canRenameOrDelete ? undefined : lockedReason(isSystem, 'rename')}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canRenameOrDelete}
              onClick={() => onRename(scenario)}
            >
              Rename
            </Button>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDuplicate(scenario)}
          >
            Duplicate
          </Button>
          <span title={canRenameOrDelete ? undefined : lockedReason(isSystem, 'delete')}>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!canRenameOrDelete}
              onClick={() => onDelete(scenario)}
            >
              Delete
            </Button>
          </span>
          <ExportMenu
            scenario={scenario}
            onExportForge={onExportForge}
            onExportCsv={onExportCsv}
          />
        </div>
      </CardHeader>
    </Card>
  );
}
