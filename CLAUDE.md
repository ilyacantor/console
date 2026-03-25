# Console — AOS Agent Constitution (Module-Specific)

> Supplements the root CLAUDE.md at `~/code/CLAUDE.md`. Root rules are authoritative.

## Module Declaration

Console is the sixth AOS service and the single production surface for all AOS user types. It replaces Platform as the frontend.

## RACI Ownership

Console is A/R for:
- Pipeline orchestration (triggering Farm, DCL, COFA via HTTP)
- All production UI (sidebar nav, dashboards, reports, pipeline screen)
- Scheduling (cron-triggered pipeline runs — future phases)
- Change aggregation (detecting and displaying drift — future phases)
- Maestra chat hosting (M button, engagement UI — future phases)
- Task queue (operator task management — future phases)
- Engagement state (engagement lifecycle UI — future phases)
- Upload/parser (file upload and parsing — future phases)

Console does NOT own:
- Detection or classification (AOD)
- Semantic logic or triple store (DCL)
- Data generation (Farm)
- Agent policy (AOA)
- Connection mapping (AAM)
- Query resolution (NLQ)

## Ports

| Service | Port |
|---------|------|
| Backend | 8009 |
| Frontend | 3009 |

## Tech Stack

- **Backend:** FastAPI + asyncpg (Supabase PG)
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS v3
- **Database:** Shared Supabase PG instance, `console` schema
- **Deployment:** Render (render.yaml)

## Module API Dependencies

Console calls these module APIs (does not access their databases directly):
- Farm: `POST /api/business-data/generate-multi-entity-triples`, `GET /api/business-data/generation-status`
- DCL: `GET /api/dcl/triples/overview`
- Platform: `POST /api/maestra/cofa-chat` (COFA unification, ME pipeline only)
- All modules: `GET /health` or equivalent (health aggregation)

## Key Rules

- No silent fallbacks. If a module API call fails, surface the error.
- No demo mode. Pipeline runs call real module APIs.
- No hardcoded data. All pipeline data comes from live module responses.
- No test-only endpoints or backdoors.
- Frontend is the pass/fail gate (B17). Use Playwright headless to verify UI.
