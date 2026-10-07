import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CMP_PICKER_STORAGE_KEY,
  COMPARISON_GROUP_SUPERGROUP,
  COMPARISON_METRIC_KEY_ORDER,
  COMPARISON_METRICS,
  COMPARISON_SUPERGROUP_LABEL,
  COMPARISON_SUPERGROUP_ORDER,
  type ComparisonMetricGroup,
  type ComparisonSupergroup,
} from '@/data/configs';
import { cn } from '@/lib/utils';

export interface ComparisonColumnPickerProps {
  activeKeys: string[];
  onToggle: (key: string) => void;
}

export const DEFAULT_COMPARISON_KEYS: readonly string[] = [
  'bcr_societal',
  'grand_total_pv',
  'total_capital_pv',
  'total_benefits_pv',
];

function knownMetricKey(key: string): boolean {
  return COMPARISON_METRIC_KEY_ORDER.has(key);
}

export function readStoredComparisonKeys(): string[] {
  try {
    const raw = localStorage.getItem(CMP_PICKER_STORAGE_KEY);
    if (!raw) return [...DEFAULT_COMPARISON_KEYS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_COMPARISON_KEYS];
    const keys = parsed.filter(
      (item): item is string => typeof item === 'string' && knownMetricKey(item),
    );
    return [...new Set(keys)];
  } catch {
    return [...DEFAULT_COMPARISON_KEYS];
  }
}

export function writeStoredComparisonKeys(keys: string[]): void {
  try {
    localStorage.setItem(CMP_PICKER_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Storage can be unavailable in private mode.
  }
}

function groupsForSupergroup(superId: ComparisonSupergroup): ComparisonMetricGroup[] {
  return COMPARISON_METRICS.filter(
    (group) => COMPARISON_GROUP_SUPERGROUP[group.group] === superId,
  );
}

export function ComparisonColumnPicker({
  activeKeys,
  onToggle,
}: ComparisonColumnPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = useMemo(() => new Set(activeKeys), [activeKeys]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggleKey(key: string): void {
    const next = active.has(key)
      ? activeKeys.filter((item) => item !== key)
      : [...activeKeys, key];
    writeStoredComparisonKeys(next);
    onToggle(key);
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Columns
      </Button>
      {open ? (
        <div
          className="absolute top-full left-0 z-30 mt-1 w-72"
          role="dialog"
          aria-label="Comparison columns"
        >
          <Card size="sm" className="max-h-96 overflow-y-auto py-1">
            {COMPARISON_SUPERGROUP_ORDER.map((superId) => {
              const groups = groupsForSupergroup(superId);
              if (groups.length === 0) return null;
              return (
                <details key={superId} className="border-b border-border/60 last:border-b-0">
                  <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold">
                    {COMPARISON_SUPERGROUP_LABEL[superId]}
                  </summary>
                  <div className="flex flex-col gap-2 px-2 pb-2">
                    {groups.map((group) => (
                      <div key={group.group}>
                        <div className="px-1 text-[11px] font-medium text-muted-foreground">
                          {group.group}
                        </div>
                        <div className="mt-0.5 flex flex-col">
                          {group.metrics.map((metric) => {
                            const selected = active.has(metric.key);
                            return (
                              <Button
                                key={metric.key}
                                type="button"
                                variant={selected ? 'secondary' : 'ghost'}
                                size="xs"
                                aria-pressed={selected}
                                className={cn('h-auto w-full justify-start py-1 text-left', selected && 'text-primary')}
                                onClick={() => toggleKey(metric.key)}
                              >
                                {metric.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
