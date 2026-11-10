import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BcrScoreboard } from '@/components/workspace/bcr-scoreboard';
import { cn } from '@/lib/utils';

export interface WorkspaceHeaderProps {
  scenarioName: string;
  unsavedChanges: boolean;
  calculationStatus: string;
  results: Record<string, unknown> | null;
  onSave: () => void;
  onRename: (name: string) => void;
  onExportForge: () => void;
  onExportCsv: () => void;
  createMode?: boolean;
  canCreate?: boolean;
  canCalculate?: boolean;
  onCalculate?: () => void;
  onCreate?: () => void;
}

export function WorkspaceHeader({
  scenarioName,
  unsavedChanges,
  calculationStatus,
  results,
  onSave,
  onRename,
  onExportForge,
  onExportCsv,
  createMode = false,
  canCreate = false,
  canCalculate = false,
  onCalculate,
  onCreate,
}: WorkspaceHeaderProps): ReactElement {
  const hasScenario = scenarioName.trim().length > 0;
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const cancelRename = useRef(false);
  const menuRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent): void {
      if (!menuRoot.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (createMode) {
          if (canCreate) onCreate?.();
          return;
        }
        if (hasScenario && canCalculate) onSave();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canCalculate, canCreate, createMode, hasScenario, onCreate, onSave]);

  function commitRename(value: string): void {
    setEditing(false);
    const next = value.trim();
    if (!next || next === scenarioName) return;
    onRename(next);
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelRename.current = true;
      setEditing(false);
    }
  }

  function closeAnd(action: () => void): void {
    setMenuOpen(false);
    action();
  }

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <Input
            aria-label="Scenario name"
            autoFocus
            defaultValue={scenarioName}
            className="max-w-sm font-semibold"
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={onRenameKeyDown}
            onBlur={(event) => {
              if (cancelRename.current) {
                cancelRename.current = false;
                return;
              }
              commitRename(event.currentTarget.value);
            }}
          />
        ) : (
          <button
            type="button"
            className={cn(
              'truncate text-left text-sm font-semibold text-slate-900',
              hasScenario &&
                !createMode &&
                'rounded-sm border-b border-dashed border-slate-300 hover:border-slate-500',
            )}
            disabled={!hasScenario}
            onClick={() => {
              if (!hasScenario || createMode) return;
              setMenuOpen(false);
              setEditing(true);
            }}
          >
            {hasScenario ? scenarioName : 'No scenario'}
          </button>
        )}
        {unsavedChanges ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
            <span aria-hidden className="size-2 rounded-full bg-amber-500" />
            Unsaved
          </span>
        ) : null}
      </div>

      <p className="text-xs text-slate-500" data-calc-status>
        {calculationStatus}
      </p>

      <BcrScoreboard results={results} />

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canCalculate}
        onClick={() => onCalculate?.()}
      >
        Calculate
      </Button>
      <div className="relative flex" ref={menuRoot}>
        {createMode ? (
          <Button type="button" size="sm" disabled={!canCreate} onClick={() => onCreate?.()}>
            Create
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              className="rounded-r-none"
              disabled={!hasScenario || !canCalculate}
              onClick={onSave}
            >
              {unsavedChanges ? 'Save' : 'Saved'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-l-none px-2"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Save and export"
              disabled={!hasScenario}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ▾
            </Button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-md"
              >
                <MenuItem
                  label="Save to Memory"
                  disabled={!canCalculate}
                  onClick={() => closeAnd(onSave)}
                />
                <MenuItem label="Export .forge" onClick={() => closeAnd(onExportForge)} />
                <MenuItem label="Export .csv" onClick={() => closeAnd(onExportCsv)} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </header>
  );
}

function MenuItem({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
