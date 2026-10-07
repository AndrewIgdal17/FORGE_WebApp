import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

export interface SubItemValidation {
  invalidCount?: number;
  hasMismatch?: boolean;
}

interface SidebarItemProps {
  subItem: { id: string; label: string };
  isActive: boolean;
  onClick: () => void;
  invalidCount?: number;
  hasMismatch?: boolean;
}

function validationLabel(invalidCount: number | undefined, hasMismatch: boolean | undefined): string | null {
  const missing = invalidCount ?? 0;
  const mismatch = Boolean(hasMismatch);
  if (missing > 0 && mismatch) return `${missing} missing + mismatch`;
  if (mismatch) return 'Mismatch';
  if (missing > 0) return `${missing} missing`;
  return null;
}

export function SidebarItem({
  subItem,
  isActive,
  onClick,
  invalidCount,
  hasMismatch,
}: SidebarItemProps): ReactElement {
  const badge = validationLabel(invalidCount, hasMismatch);

  return (
    <button
      type="button"
      data-sub-item-id={subItem.id}
      aria-current={isActive ? 'page' : undefined}
      title={badge ?? undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-forge-primary-light hover:text-forge-primary',
        isActive && 'bg-forge-primary-light font-semibold text-forge-primary',
        badge && 'my-0.5 rounded-md bg-red-500 font-semibold text-white hover:bg-red-500 hover:text-white',
      )}
    >
      <span>{subItem.label}</span>
      {badge ? <span className="shrink-0 text-[0.6rem] whitespace-nowrap opacity-90">{badge}</span> : null}
    </button>
  );
}
