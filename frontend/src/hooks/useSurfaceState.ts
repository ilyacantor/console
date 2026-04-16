/**
 * useSurfaceState — POST the current Console surface snapshot to the Console
 * MCP server so Mai's `get_surface_state` tool returns real page content
 * (route, active engagement, visible panels, per-route extras) instead of
 * "no snapshot pushed yet".
 *
 * Mount once at App level via <SurfaceStateSync/>. Re-pushes whenever the
 * route, active engagement, or any page's published extras change.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useEngagement } from '../context/EngagementContext';
import { useSurfaceExtrasAll } from '../context/SurfaceExtrasContext';
import { getOrCreateSessionId } from '../utils/chatSession';

export function useSurfaceState() {
  const location = useLocation();
  const { activeEngagement } = useEngagement();
  const extras = useSurfaceExtrasAll();
  const lastSentRef = useRef<string>('');

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const payload = {
      session_id: sessionId,
      route: location.pathname,
      active_engagement_id: activeEngagement?.engagement_id ?? null,
      visible_panels: extras.visible_panels ?? [],
      active_selection: extras.active_selection ?? null,
      last_errors: extras.last_errors ?? [],
      extra: extras.extra ?? {},
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastSentRef.current) return;
    lastSentRef.current = serialized;
    void fetch('/api/mcp/surface-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized,
    }).catch((err) => {
      // Push is best-effort — if Console MCP is unreachable Mai's tool
      // will tell her so on the next get_surface_state call.
      console.warn('[surface-state] push failed:', err);
    });
  }, [
    location.pathname,
    activeEngagement?.engagement_id,
    extras,
  ]);
}
