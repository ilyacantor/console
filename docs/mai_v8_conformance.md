# Console Mai v8 §3.5 Conformance Checklist

Evidence per blueprint §3.5 that Console is the conformant reference surface.
All 10 items PASS as of Brain-BC landing.

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Canonical envelope (no extra/missing fields) | PASS | `frontend/src/hooks/useMaiStream.ts` builds `{message, session_id, surface_id, tenant_id, operator_id, engagement_id, page_context}` only. No legacy fields. |
| 2 | Handles SSE with all event types | PASS | Same hook handles `content`, `tool_use`, `tool_result`, `done`, `error` (5 types — blueprint §3.5 says four but §3.2 defines five; implementation covers all five). Split by `\n\n`. |
| 3 | Renders markdown | PASS | `frontend/src/components/MaiPanel.tsx` pipes Mai turns through `marked` + `DOMPurify`; same renderer used pre-v8. |
| 4 | Widget mounted in canonical position | PASS | `MaiPanel.tsx` (`MaiFloat` component) is the fixed floating widget rendered from `App.tsx`. |
| 5 | MCP `get_surface_state` exposed | PASS | `backend/app/routes/mcp.py` — `POST /api/mcp/tools/call` with `tool=get_surface_state`. `GET /api/mcp/info` lists it. `POST /api/mcp/surface-state` receives snapshots. |
| 6 | Chat history read on mount | PASS | `MaiPanel.tsx` `loadHistory` useEffect fetches `/api/proxy/platform/api/mai/chat/history?session_id=...` keyed on `sessionId`. Turns replayed into `FloatMessage[]`. |
| 7 | No M&A framing off Convergence | PASS | `mai/presets.ts::buildPresets` returns `MA_PRESETS` only when `isConvergenceRoute && hasActiveEngagement`. Generic otherwise. |
| 8 | No 404 / 422 when no engagement | PASS | Canonical envelope makes `engagement_id` optional. `Platform routes.py` does not require it. Memory composer falls back to operator-only context when absent. |
| 9 | Session ID stable across in-surface nav | PASS | `loadOrCreateSessionId()` reads/writes `mai.session_id` to `localStorage`; MaiPanel initializes state from it. Router changes do not remount the floating widget. |
| 10 | `done` event metadata logged | PASS | Platform `routes.py` writes `ledger.write_run("mai-chat", ...)` before yielding `done`, including `session_id`, cost, turn indexes. Console reads via `mai_runs` table (shared Supabase PG). |

## Notes

- Surface MCP in-memory store (`_SURFACE_STATE: dict`) is single-process dev only.
  Promote to shared storage when Console moves to multi-worker uvicorn.
- Console ledger ownership preserved per plan: Platform writes directly to
  `console.mai_runs` via shared `SUPABASE_DB_URL` pool.
- Observability config (§8.0) at `console/config/mai_observability.yaml` loaded
  via `backend/app/config.py::load_mai_observability`.
