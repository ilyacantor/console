# Deployment tour — local demo runbook

One operator surface (Console) embeds module surfaces via iframe. Each module runs `main`. Console runs `main` after the dev→main fast-forward.

## Required services

| Service | Port (FE / BE) | Branch | Used by tour stage |
|---|---|---|---|
| Console | 3009 / 8009 | main | Host (all stages, overlay, timeline, Mai) |
| AOD | 8001 (server-rendered) | main | Stage 1 iframe — Discovery topology with governance + SOR |
| Farm | 8003 (server-rendered) | main | Stage 2 iframe — synthetic environment |
| AAM | 8002 (server-rendered) | main | Not iframed; tour uses Console-seeded PipelineCatalog/MappingsReview |
| DCL | 3004 / 8004 | main | Stage 6 iframe — Inspect Lineage tab |
| NLQ | 3005 / 8005 | main | Stage 7 iframe — `?view=galaxy` |
| Platform | 3006 / 8006 | main | Mai chat backend (Console MaiPanel → Platform) |

## Start everything

```bash
~/code/aos-launch.sh        # laptop (WSL); starts pm2 for all 7 services
# OR on desktop:
aos-start
```

Verify: `pm2 status` shows `online` for `aod-backend`, `aam-backend`, `farm-backend`, `dcl-backend`, `dcl-frontend`, `nlq-backend`, `nlq-frontend`, `platform-backend`, `platform-frontend`, `console-backend`, `console-frontend`.

## Required env (per operator machine)

`console/.env` must contain:

```
DCL_MCP_TOKEN_SECRET=wp5-shim-secret-2026-rotate-when-platform-issuance-lands
AOS_TENANT_ID=<your dev tenant uuid>
AOS_OPERATOR_ID=ilya
```

`console/frontend/.env` (or `.env.local`) — iframe URL overrides. Omit for localhost defaults:

```
# VITE_AOD_URL=http://localhost:8001
# VITE_FARM_URL=http://localhost:8003
# VITE_DCL_URL=http://localhost:3004
# VITE_NLQ_URL=http://localhost:3005
```

For a remote demo machine, set these to the staging/production URLs of each module's main.

## Launch the tour

Open Console: `http://localhost:3009`. Sidebar → **DEMO → Start tour**. Or deeplink:

```
http://localhost:3009/aod/inventory?tour=deploy&stage=aod-scan
```

Overlay appears at top with stage narration; timeline strip at bottom; **Next** advances through the 9 stages. **Exit** closes the tour; Console returns to normal operation.

## Tour stages at a glance

| # | Day | Route | Surface |
|---|---|---|---|
| 1 | 1–2 | `/aod/inventory` | iframe AOD `:8001/` (Discovery + governance + SOR) |
| 2 | 1–2 | `/preview/synthetic` | iframe Farm `:8003/` |
| 3 | 2–7 | `/deploy/credentials` | Console-native (no module surface exists) |
| 4 | 7–9 | `/pipelines/catalog` | Console retrofit (seeded; direct-connect + MCP callouts) |
| 5 | 9–13 | `/mappings/review` | Console retrofit (TransportFlow + proposals) |
| 6 | 13–15 | `/inspect` | Console retrofit; Lineage tab iframes DCL `:3004` |
| 7 | 13–15 | `/consumption` | Plug-in panel + NLQ `:3005?view=galaxy` iframe |
| 8 | 15–30+ | `/contextos/config` | Placeholder (no module yet) |
| 9 | close | `/tour/recap` | Console recap with expanded timeline |

## Verify end-to-end

1. `http://localhost:3009/aod/inventory?tour=deploy&stage=aod-scan` — overlay shows "Day 1 — See what's there", iframe loads AOD's Discovery tab.
2. Click **Next** through all 9 stages without errors. Each iframe renders the right module; Console-native stages render seeded Crestline content.
3. Mai panel (bottom-right pill) opens, shows stage-aware presets (e.g. "What's an SOR score?" at Stage 1).
4. Run the suite: `cd frontend && npx playwright test deployment_tour_e2e.spec.ts` — 4 passed.

## Notes

- Iframed modules show their **real** dev data, not Crestline seed. Narration is Crestline-themed by design.
- Stages 3, 4, 5, 7, 8 are Console-native and render the Crestline seed deterministically.
- Mai sees `tour_stage` in surface-state extras (pushed by `TourContext`) and biases responses per `frontend/src/demo/maiStageConfig.ts`.
- Tour exits cleanly: no state writes to any module DB.
