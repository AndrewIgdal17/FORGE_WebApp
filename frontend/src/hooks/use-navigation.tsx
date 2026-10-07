import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';

export type ViewType = 'inputs' | 'results' | 'sensitivity';

export interface NavigationState {
  view: ViewType;
  sectionId: string | null;
  subItemId: string | null;
}

export interface NavigationContextValue extends NavigationState {
  setView: (view: ViewType) => void;
  selectSubItem: (sectionId: string, subItemId: string) => void;
}

const INITIAL_STATE: NavigationState = {
  view: 'inputs',
  sectionId: 'project-identity',
  subItemId: 'technology',
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

function firstSelection(view: 'inputs' | 'results'): Pick<NavigationState, 'sectionId' | 'subItemId'> {
  const section = SIDEBAR_SECTIONS[view][0];
  const subItem = section?.subItems[0];
  return {
    sectionId: section?.id ?? null,
    subItemId: subItem?.id ?? null,
  };
}

function isKnownSubItem(view: ViewType, sectionId: string, subItemId: string): boolean {
  if (view === 'sensitivity') return false;
  return SIDEBAR_SECTIONS[view].some(
    (section) =>
      section.id === sectionId && section.subItems.some((item) => item.id === subItemId),
  );
}

export function NavigationProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<NavigationState>(INITIAL_STATE);

  const setView = useCallback((view: ViewType) => {
    setState((current) => {
      if (view === 'sensitivity') {
        return { ...current, view };
      }
      return { view, ...firstSelection(view) };
    });
  }, []);

  const selectSubItem = useCallback((sectionId: string, subItemId: string) => {
    setState((current) => {
      if (!isKnownSubItem(current.view, sectionId, subItemId)) return current;
      return { ...current, sectionId, subItemId };
    });
  }, []);

  const value = useMemo<NavigationContextValue>(
    () => ({
      view: state.view,
      sectionId: state.sectionId,
      subItemId: state.subItemId,
      setView,
      selectSubItem,
    }),
    [state.view, state.sectionId, state.subItemId, setView, selectSubItem],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return value;
}
