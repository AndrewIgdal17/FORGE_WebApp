import type { ReactElement } from 'react';
import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';
import { useNavigation } from '@/hooks/use-navigation';
import { SidebarSection } from '@/components/sidebar/sidebar-section';
import { ViewToggle } from '@/components/sidebar/view-toggle';

export function Sidebar(): ReactElement {
  const { view, subItemId, selectSubItem } = useNavigation();

  return (
    <aside className="flex h-full w-[260px] min-w-[260px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50">
      <div className="sticky top-0 z-10 bg-slate-50 px-3 pt-3">
        <ViewToggle />
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
            />
          ))
        )}
      </nav>
    </aside>
  );
}
