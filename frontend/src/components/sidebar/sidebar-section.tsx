import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { SidebarItem } from '@/components/sidebar/sidebar-item';

interface SidebarSectionProps {
  section: { id: string; label: string; color: string; subItems: { id: string; label: string }[] };
  activeSubItemId: string | null;
  onSelectSubItem: (subItemId: string) => void;
  showCount?: boolean;
  fieldCount?: number | null;
  isResultsView?: boolean;
}

export function SidebarSection({
  section,
  activeSubItemId,
  onSelectSubItem,
  showCount = false,
  fieldCount = null,
  isResultsView = false,
}: SidebarSectionProps): ReactElement {
  const containsActive = section.subItems.some((item) => item.id === activeSubItemId);
  const [open, setOpen] = useState(containsActive);

  useEffect(() => {
    if (section.subItems.some((item) => item.id === activeSubItemId)) {
      setOpen(true);
    }
  }, [activeSubItemId, section.subItems]);

  function handleHeaderClick(): void {
    setOpen((current) => !current);
    if (isResultsView && section.id.startsWith('r-') && section.id !== 'r-summary') {
      onSelectSubItem(`${section.id}-overview`);
    }
  }

  return (
    <div className="border-b border-slate-200/70" data-section-id={section.id}>
      <button
        type="button"
        aria-expanded={open}
        onClick={handleHeaderClick}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8rem] font-semibold text-slate-800 hover:bg-slate-100',
          containsActive && 'bg-forge-primary-light/50',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block w-3 origin-center text-center text-[0.6rem] text-slate-400 transition-transform',
            open && 'rotate-90',
          )}
        >
          ▶
        </span>
        <span
          aria-hidden
          data-section={section.id}
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: section.color }}
        />
        <span className="truncate">{section.label}</span>
        {showCount && fieldCount != null ? (
          <span className="ml-auto rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.65rem] font-normal text-slate-500">
            {fieldCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="ml-7 border-l border-slate-200">
          {section.subItems.map((subItem) => (
            <SidebarItem
              key={subItem.id}
              subItem={subItem}
              isActive={subItem.id === activeSubItemId}
              onClick={() => onSelectSubItem(subItem.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
