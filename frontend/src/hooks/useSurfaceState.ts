/**
 * useSurfaceState — POST the current Console surface snapshot to the Console
 * MCP server so Mai's `get_surface_state` tool returns real page content
 * instead of "no snapshot pushed yet".
 *
 * Mount once at App level via <SurfaceStateSync/>. Re-pushes whenever the
 * route or any page's published extras change. Also fires a 60s heartbeat
 * through the same publish path so an idle page recovers from a
 * console-backend restart without waiting for the operator to navigate.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSurfaceExtrasAll } from '../context/SurfaceExtrasContext';
import { getOrCreateSessionId } from '../utils/chatSession';

const HEARTBEAT_MS = 60_000;

export function useSurfaceState() {
  const location = useLocation();
  const extras = useSurfaceExtrasAll();
  const lastSentRef = useRef<string>('');
  const lastPublishAtRef = useRef<number>(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const payload = {
      session_id: sessionId,
      route: location.pathname,
      visible_panels: extras.visible_panels ?? [],
      active_selection: extras.active_selection ?? null,
      last_errors: extras.last_errors ?? [],
      extra: extras.extra ?? {},
    };
    const serialized = JSON.stringify(payload);
    const now = Date.now();
    const stale = now - lastPublishAtRef.current >= HEARTBEAT_MS;
    if (serialized === lastSentRef.current && !stale) return;
    lastSentRef.current = serialized;
    lastPublishAtRef.current = now;
    void fetch('/api/mcp/surface-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized,
    }).catch((err) => {
      console.warn('[surface-state] push failed:', err);
    });
  }, [
    location.pathname,
    extras,
    tick,
  ]);
}
