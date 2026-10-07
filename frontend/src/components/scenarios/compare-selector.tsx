import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useScenarioStore, type Scenario } from '@/stores/scenario-store';

export interface CompareSelectorProps {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  baselineId: string | null;
  onBaselineChange: (id: string) => void;
}

function byUpdatedAtDesc(a: Scenario, b: Scenario): number {
  return b.updated_at.localeCompare(a.updated_at);
}

export function CompareSelector({
  selectedIds,
  onSelectionChange,
  baselineId,
  onBaselineChange,
}: CompareSelectorProps): ReactElement {
  const scenarios = useScenarioStore((state) => state.scenarios);

  const ordered = useMemo(() => {
    const system = scenarios
      .filter((scenario) => scenario.source === 'system')
      .sort(byUpdatedAtDesc);
    const user = scenarios
      .filter((scenario) => scenario.source !== 'system')
      .sort(byUpdatedAtDesc);
    return [...system, ...user];
  }, [scenarios]);

  const selectedCount = ordered.filter((scenario) => selectedIds.has(scenario.id)).length;
  const allSelected = ordered.length > 0 && selectedCount === ordered.length;

  function applySelection(next: Set<string>, preferredBaselineId: string | null): void {
    onSelectionChange(next);
    if (next.size === 0) return;
    if (baselineId !== null && next.has(baselineId)) return;
    const nextBaseline =
      preferredBaselineId !== null && next.has(preferredBaselineId)
        ? preferredBaselineId
        : ordered.find((scenario) => next.has(scenario.id))?.id;
    if (nextBaseline) onBaselineChange(nextBaseline);
  }

  function toggleScenario(id: string, checked: boolean): void {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
      applySelection(next, id);
      return;
    }
    next.delete(id);
    applySelection(next, null);
  }

  function toggleAll(): void {
    if (allSelected) {
      onSelectionChange(new Set());
      return;
    }
    const next = new Set(ordered.map((scenario) => scenario.id));
    applySelection(next, ordered[0]?.id ?? null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Scenarios</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={ordered.length === 0}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>
      </div>

      <ul className="flex flex-col gap-1">
        {ordered.map((scenario) => {
          const selected = selectedIds.has(scenario.id);
          const isBaseline = selected && scenario.id === baselineId;
          const canSetBaseline = selected && !isBaseline;

          return (
            <li
              key={scenario.id}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5',
                selected && 'bg-muted/60',
                isBaseline && 'bg-primary/5',
              )}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => {
                  toggleScenario(scenario.id, checked);
                }}
                aria-label={`Select ${scenario.name}`}
              />
              {canSetBaseline ? (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                  onClick={() => onBaselineChange(scenario.id)}
                >
                  {scenario.name}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">{scenario.name}</span>
              )}
              {isBaseline ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Baseline
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {selectedCount < 2 ? (
        <p className="text-sm text-muted-foreground">
          Select at least 2 scenarios to compare
        </p>
      ) : null}
    </div>
  );
}
