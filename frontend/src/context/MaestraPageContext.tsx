/**
 * MaestraPageContext — Captures visible page state for Maestra context injection.
 *
 * Each page registers its current visible state (errors, data counts,
 * selections) via setPageContext(). MaestraFloat reads this context and
 * injects it into chat requests so Maestra knows what the user is seeing.
 *
 * The context block is invisible to the user — it only appears in the API
 * request message, not in the chat UI.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export interface PageContext {
  route: string;
  tabLabel: string;
  visibleErrors: string[];
  connectionStatus?: string;
  dataState?: string;
  activeSweep?: string;
  activeEntity?: string;
  summary?: string;
}

interface MaestraPageContextType {
  pageContext: PageContext;
  setPageContext: (ctx: Partial<PageContext>) => void;
  clearPageContext: () => void;
}

function defaultPageContext(): PageContext {
  return {
    route: window.location.pathname,
    tabLabel: '',
    visibleErrors: [],
  };
}

const MaestraPageCtx = createContext<MaestraPageContextType | undefined>(undefined);

export function MaestraPageContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContext>(defaultPageContext);

  const setPageContext = useCallback((ctx: Partial<PageContext>) => {
    setPageContextState((prev) => ({
      ...prev,
      ...ctx,
      route: ctx.route ?? window.location.pathname,
      visibleErrors: ctx.visibleErrors ?? prev.visibleErrors,
    }));
  }, []);

  const clearPageContext = useCallback(() => {
    setPageContextState(defaultPageContext());
  }, []);

  return (
    <MaestraPageCtx.Provider value={{ pageContext, setPageContext, clearPageContext }}>
      {children}
    </MaestraPageCtx.Provider>
  );
}

export function usePageContext() {
  const ctx = useContext(MaestraPageCtx);
  if (ctx === undefined) {
    throw new Error('usePageContext must be used within a MaestraPageContextProvider');
  }
  return ctx;
}
