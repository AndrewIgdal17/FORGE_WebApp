import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { Project } from '@/stores/project-store';
import {
  generateScenarioName,
  type Scenario,
  type ScenarioDraft,
} from '@/stores/scenario-store';

const SOLE_SCENARIO_TOOLTIP = 'A project needs at least one scenario';

type OpenMenu = 'switch' | 'more' | null;

export interface ScenarioToolbarProps {
  project: Project;
  scenarios: Scenario[];
  activeId: string;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onNew: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onCompare: () => void;
}

export interface ScenarioMenuItem {
  id: string;
  name: string;
  checked: boolean;
}

/** Draft stored when the user starts a scenario from defaults inside this project. */
export function newScenarioFromDefaults(
  projectId: string,
  existingNames: string[],
): ScenarioDraft {
  return {
    name: generateScenarioName('Scenario', existingNames),
    source: 'manual',
    changes: {},
    project_id: projectId,
  };
}

function scenariosInCreationOrder(projectId: string, scenarios: Scenario[]): Scenario[] {
  return scenarios
    .filter((scenario) => scenario.project_id === projectId)
    .sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
}

/** The switcher menu model: this project's scenarios in created_at order, with the active one checked. */
export function scenarioMenuItems(
  projectId: string,
  scenarios: Scenario[],
  activeId: string,
): ScenarioMenuItem[] {
  return scenariosInCreationOrder(projectId, scenarios).map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    checked: scenario.id === activeId,
  }));
}

/** The action a switcher item runs on click: it selects that scenario id. */
export function chooseScenario(onSelect: (id: string) => void, id: string): () => void {
  return () => onSelect(id);
}

function MenuItem({
  label,
  onClick,
  disabled = false,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100',
        disabled ? 'cursor-not-allowed text-slate-400' : 'text-slate-700',
      )}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SwitchItem({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
      onClick={onClick}
    >
      <span aria-hidden className="w-3 text-slate-900">{checked ? '✓' : ''}</span>
      {label}
    </button>
  );
}

export function ScenarioToolbar({
  project,
  scenarios,
  activeId,
  readOnly,
  onSelect,
  onDuplicate,
  onNew,
  onRename,
  onDelete,
  onCompare,
}: ScenarioToolbarProps): ReactElement {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const items = scenarioMenuItems(project.id, scenarios, activeId);
  const active = items.find((item) => item.checked) ?? null;
  const sole = items.length === 1;

  useEffect(() => {
    if (!openMenu) return;
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  function toggleMenu(menu: Exclude<OpenMenu, null>): void {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  function closeAnd(action: () => void): void {
    setOpenMenu(null);
    action();
  }

  const activeName = active?.name ?? 'No scenario';

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Scenarios"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative">
        <button
          type="button"
          aria-label={`Scenario: ${activeName}`}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'switch'}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          onClick={() => toggleMenu('switch')}
        >
          <span>{activeName}</span>
          <span aria-hidden className="text-xs text-slate-500">▾</span>
        </button>
        <div
          role="menu"
          hidden={openMenu !== 'switch'}
          className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-md"
        >
          {items.map((item) => (
            <SwitchItem
              key={item.id}
              label={item.name}
              checked={item.checked}
              onClick={() => closeAnd(chooseScenario(onSelect, item.id))}
            />
          ))}
        </div>
      </div>
      <a
        href={`/app/projects/${encodeURIComponent(project.id)}/compare`}
        className="rounded-md px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100"
        onClick={(event) => {
          event.preventDefault();
          onCompare();
        }}
      >
        Compare
      </a>
      <button
        type="button"
        className="rounded-md px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
        disabled={!readOnly && activeId.length === 0}
        onClick={() => onDuplicate(activeId)}
      >
        Duplicate
      </button>
      {readOnly ? null : (
        <div className="relative">
          <button
            type="button"
            aria-label="More scenario actions"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'more'}
            className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => toggleMenu('more')}
          >
            ⋯
          </button>
          <div
            role="menu"
            hidden={openMenu !== 'more'}
            className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-md"
          >
            <MenuItem
              label="Rename"
              disabled={activeId.length === 0}
              onClick={() => closeAnd(() => onRename(activeId))}
            />
            <MenuItem
              label="Delete"
              disabled={sole || activeId.length === 0}
              title={sole ? SOLE_SCENARIO_TOOLTIP : undefined}
              onClick={() => closeAnd(() => onDelete(activeId))}
            />
            <MenuItem label="New scenario from defaults" onClick={() => closeAnd(onNew)} />
          </div>
        </div>
      )}
    </div>
  );
}
