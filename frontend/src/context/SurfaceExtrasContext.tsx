/**
 * SurfaceExtrasContext — pages publish their current visible state here so
 * Mai's `get_surface_state` returns real per-page content instead of just
 * the route. Each page calls `useSurfaceExtras(owner, extras)` once; the
 * latest snapshot per owner is merged into a single payload and posted to
 * POST /api/mcp/surface-state by `useSurfaceState`.
 *
 * Shape follows the Console MCP `SurfaceStateUpdate` schema
 * (backend/app/routes/mcp.py:51): `visible_panels`, `active_selection`,
 * `last_errors`, plus freeform `extra`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface SurfaceExtras {
  visible_panels?: string[];
  active_selection?: Record<string, unknown> | null;
  last_errors?: string[];
  extra?: Record<string, unknown>;
}

interface SurfaceExtrasCtx {
  extras: SurfaceExtras;
  setExtras: (owner: string, extras: SurfaceExtras | null) => void;
}

const SurfaceExtrasContext = createContext<SurfaceExtrasCtx | null>(null);

export function SurfaceExtrasProvider({ children }: { children: ReactNode }) {
  const [byOwner, setByOwner] = useState<Record<string, SurfaceExtras>>({});

  const setExtras = useCallback(
    (owner: string, next: SurfaceExtras | null) => {
      setByOwner((prev) => {
        if (next === null) {
          if (!(owner in prev)) return prev;
          const clone = { ...prev };
          delete clone[owner];
          return clone;
        }
        return { ...prev, [owner]: next };
      });
    },
    [],
  );

  const extras = useMemo<SurfaceExtras>(() => {
    const panels: string[] = [];
    const errors: string[] = [];
    const extra: Record<string, unknown> = {};
    let selection: Record<string, unknown> | null = null;
    for (const entry of Object.values(byOwner)) {
      if (entry.visible_panels) panels.push(...entry.visible_panels);
      if (entry.last_errors) errors.push(...entry.last_errors);
      if (entry.active_selection) selection = entry.active_selection;
      if (entry.extra) Object.assign(extra, entry.extra);
    }
    const merged: SurfaceExtras = {};
    if (panels.length) merged.visible_panels = panels;
    if (errors.length) merged.last_errors = errors;
    if (selection) merged.active_selection = selection;
    if (Object.keys(extra).length) merged.extra = extra;
    return merged;
  }, [byOwner]);

  const ctxValue = useMemo(() => ({ extras, setExtras }), [extras, setExtras]);

  return (
    <SurfaceExtrasContext.Provider value={ctxValue}>
      {children}
    </SurfaceExtrasContext.Provider>
  );
}

export function useSurfaceExtrasAll(): SurfaceExtras {
  const ctx = useContext(SurfaceExtrasContext);
  if (!ctx) {
    throw new Error(
      'useSurfaceExtrasAll must be used inside <SurfaceExtrasProvider>',
    );
  }
  return ctx.extras;
}

function useSurfaceExtrasSetter() {
  const ctx = useContext(SurfaceExtrasContext);
  if (!ctx) {
    throw new Error(
      'useSurfaceExtras must be used inside <SurfaceExtrasProvider>',
    );
  }
  return ctx.setExtras;
}

/**
 * Pages call this to publish their current visible state. `owner` must be
 * stable across renders (the page route/component name). `extras` re-publishes
 * whenever its serialized form changes — pass a memoized object if you need
 * finer control.
 */
export function useSurfaceExtras(
  owner: string,
  extras: SurfaceExtras | null,
) {
  const setExtras = useSurfaceExtrasSetter();
  const serialized = extras === null ? '__null__' : JSON.stringify(extras);
  useEffect(() => {
    setExtras(owner, extras);
    return () => setExtras(owner, null);
    // `extras` is compared by value via `serialized` so callers don't need
    // to memoize it themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, serialized, setExtras]);
}
