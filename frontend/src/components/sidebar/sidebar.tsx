import type { ReactElement } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';
import { useNavigation } from '@/hooks/use-navigation';
import { SidebarSection } from '@/components/sidebar/sidebar-section';
import type { SubItemValidation } from '@/components/sidebar/sidebar-item';
import { ViewToggle } from '@/components/sidebar/view-toggle';
import { cn } from '@/lib/utils';

interface SidebarProps {
  validation?: Record<string, SubItemValidation>;
  collapsed?: boolean;
  onToggle?: () => void;
}

function CollapsedRail({
  onToggle,
}: {
  onToggle?: () => void;
}): ReactElement {
  const { view, setView, selectSubItem } = useNavigation();
  const sections = view === 'sensitivity' ? [] : SIDEBAR_SECTIONS[view];

  return (
    <aside
      id="workspace-sidebar"
      className="flex h-full w-12 min-w-12 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand sidebar"
        aria-expanded={false}
        aria-controls="workspace-sidebar"
        className="flex h-10 w-full items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <ChevronRight className="size-4" />
      </button>

      <div className="flex flex-col gap-0.5 px-1 py-1">
        {(['inputs', 'results'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            title={v === 'inputs' ? 'Inputs' : 'Results'}
            className={cn(
              'rounded-full px-1.5 py-1 text-[0.6rem] font-semibold leading-none text-slate-500',
              view === v && 'bg-forge-primary text-white',
            )}
          >
            {v === 'inputs' ? 'I' : 'R'}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-col items-center gap-2 py-2">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            title={section.label}
            onClick={() => {
              onToggle?.();
              selectSubItem(section.id, section.subItems[0]?.id ?? '');
            }}
            className="size-2.5 shrink-0 rounded-full transition-transform hover:scale-150"
            style={{ backgroundColor: section.color }}
          />
        ))}
      </div>
    </aside>
  );
}

export function Sidebar({ validation, collapsed = false, onToggle }: SidebarProps): ReactElement {
  const { view, subItemId, selectSubItem } = useNavigation();

  if (collapsed) {
    return <CollapsedRail onToggle={onToggle} />;
  }

  return (
    <aside
      id="workspace-sidebar"
      className="flex h-full w-[260px] min-w-[260px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50"
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 bg-slate-50 px-3 pt-3">
        <div className="flex-1">
          <ViewToggle />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          aria-expanded={true}
          aria-controls="workspace-sidebar"
          title="Collapse sidebar  [ "
          className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>
      <div data-sidebar-search-slot className="sticky top-12 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3">
        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-400">
          Search fields...
        </div>
      </div>
      <nav className="flex-1" aria-label="Workspace sections">
        {view === 'sensitivity' ? (
          <p className="px-4 py-6 text-sm text-slate-500">Sensitivity analysis</p>
        ) : (
          SIDEBAR_SECTIONS[view].map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              activeSubItemId={subItemId}
              onSelectSubItem={(id) => selectSubItem(section.id, id)}
              showCount={view === 'inputs'}
              isResultsView={view === 'results'}
              validation={view === 'inputs' ? validation : undefined}
            />
          ))
        )}
      </nav>
    </aside>
  );
}
