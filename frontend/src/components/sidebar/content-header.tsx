import type { ReactElement } from 'react';
import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';
import type { SidebarSection } from '@/data/sidebar-sections';
import type { ViewType } from '@/hooks/use-navigation';
import { useNavigation } from '@/hooks/use-navigation';

function resolveSelection(
  view: ViewType,
  sectionId: string | null,
  subItemId: string | null,
): { section: SidebarSection; subItemLabel: string } | null {
  if (view === 'sensitivity' || sectionId === null || subItemId === null) return null;
  const section = SIDEBAR_SECTIONS[view].find((entry) => entry.id === sectionId);
  const subItem = section?.subItems.find((entry) => entry.id === subItemId);
  if (!section || !subItem) return null;
  return { section, subItemLabel: subItem.label };
}

export function ContentHeader(): ReactElement | null {
  const { view, sectionId, subItemId } = useNavigation();
  const current = resolveSelection(view, sectionId, subItemId);
  if (!current) return null;

  return (
    <header className="mb-6 flex flex-wrap items-center gap-3 border-b-2 border-forge-primary/15 pb-3">
      <span
        aria-hidden
        data-section={current.section.id}
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: current.section.color }}
      />
      <h2 className="text-lg font-semibold text-slate-900">{current.subItemLabel}</h2>
      <span className="text-xs text-slate-500">
        {current.section.label} → {current.subItemLabel}
      </span>
    </header>
  );
}
