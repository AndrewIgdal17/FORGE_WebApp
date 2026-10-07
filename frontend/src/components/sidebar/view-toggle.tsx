import type { ReactElement } from 'react';
import type { ViewType } from '@/hooks/use-navigation';
import { useNavigation } from '@/hooks/use-navigation';
import { cn } from '@/lib/utils';

const VIEWS: { id: ViewType; label: string }[] = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'results', label: 'Results' },
  { id: 'sensitivity', label: 'Sensitivity' },
];

export function ViewToggle(): ReactElement {
  const { view, setView } = useNavigation();

  return (
    <div className="flex gap-1 rounded-full bg-black/5 p-1" role="tablist" aria-label="Workspace view">
      {VIEWS.map((tab) => {
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-view={tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              'flex-1 rounded-full px-2.5 py-1.5 text-xs text-slate-600',
              active && 'bg-forge-primary font-bold text-white',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
