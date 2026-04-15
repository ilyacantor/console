/**
 * MaiPageContext — Captures visible page state for Mai context injection.
 *
 * Each page registers its current visible state (errors, data counts,
 * selections) via setPageContext(). MaiFloat reads this context and
 * injects it into chat requests so Mai knows what the user is seeing.
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

interface MaiPageContextType {
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

const MaiPageCtx = createContext<MaiPageContextType | undefined>(undefined);

export function MaiPageContextProvider({ children }: { children: ReactNode }) {
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
    <MaiPageCtx.Provider value={{ pageContext, setPageContext, clearPageContext }}>
      {children}
    </MaiPageCtx.Provider>
  );
}

export function usePageContext() {
  const ctx = useContext(MaiPageCtx);
  if (ctx === undefined) {
    throw new Error('usePageContext must be used within a MaiPageContextProvider');
  }
  return ctx;
}
