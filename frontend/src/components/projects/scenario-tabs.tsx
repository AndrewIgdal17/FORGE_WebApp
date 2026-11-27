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

export interface ScenarioTabsProps {
  project: Project;
  scenarios: Scenario[];
  activeId: string;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onNew: () => void;
  onMakeBase: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onCompare: () => void;
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

function TabMenuItem({
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

export function ScenarioTabs({
  project,
  scenarios,
  activeId,
  readOnly,
  onSelect,
  onDuplicate,
  onNew,
  onMakeBase,
  onRename,
  onDelete,
  onCompare,
}: ScenarioTabsProps): ReactElement {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const ordered = scenariosInCreationOrder(project.id, scenarios);
  const sole = ordered.length === 1;

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

  function toggleMenu(id: string): void {
    setOpenMenu((current) => (current === id ? null : id));
  }

  function closeAnd(action: () => void): void {
    setOpenMenu(null);
    action();
  }

  return (
    <div
      ref={rootRef}
      role="tablist"
      aria-label="Scenarios"
      className="flex flex-wrap items-end gap-1"
    >
      {ordered.map((scenario) => {
        const isBase = project.base_scenario_id === scenario.id;
        const selected = scenario.id === activeId;
        const menuOpen = openMenu === scenario.id;
        return (
          <div key={scenario.id} className="relative flex">
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                'rounded-t-md px-2.5 py-1 text-sm',
                selected
                  ? 'bg-white font-semibold text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
              onClick={() => onSelect(scenario.id)}
            >
              {isBase ? '★ ' : null}
              {scenario.name}
            </button>
            <button
              type="button"
              className="rounded-md px-1 text-xs text-slate-500 hover:bg-slate-100"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Scenario menu for ${scenario.name}`}
              onClick={() => toggleMenu(scenario.id)}
            >
              ▾
            </button>
            <div
              role="menu"
              hidden={!menuOpen}
              className="absolute left-0 top-full z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-md"
            >
              {readOnly ? null : (
                <TabMenuItem
                  label="Make base"
                  onClick={() => closeAnd(() => onMakeBase(scenario.id))}
                />
              )}
              {readOnly ? null : (
                <TabMenuItem
                  label="Rename"
                  onClick={() => closeAnd(() => onRename(scenario.id))}
                />
              )}
              <TabMenuItem
                label="Duplicate"
                onClick={() => closeAnd(() => onDuplicate(scenario.id))}
              />
              {readOnly ? null : (
                <TabMenuItem
                  label="Delete"
                  disabled={sole}
                  title={sole ? SOLE_SCENARIO_TOOLTIP : undefined}
                  onClick={() => closeAnd(() => onDelete(scenario.id))}
                />
              )}
            </div>
          </div>
        );
      })}
      <div className="relative">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'add'}
          aria-label="Add scenario"
          onClick={() => toggleMenu('add')}
        >
          +
        </button>
        <div
          role="menu"
          hidden={openMenu !== 'add'}
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-md"
        >
          <TabMenuItem
            label="Duplicate this scenario"
            disabled={activeId.length === 0}
            onClick={() => closeAnd(() => onDuplicate(activeId))}
          />
          <TabMenuItem
            label="New scenario from defaults"
            onClick={() => closeAnd(onNew)}
          />
        </div>
      </div>
      <a
        role="tab"
        href={`/app/projects/${encodeURIComponent(project.id)}/compare`}
        className="rounded-t-md px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-100"
        onClick={(event) => {
          event.preventDefault();
          onCompare();
        }}
      >
        Compare
      </a>
    </div>
  );
}
