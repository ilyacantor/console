# Console Follow-Up Work

## Open

### Farm ME → Convergence P&L concept-mapping bug
**Surfaced:** 2026-04-14 by the `convergence_surfaces_visible` pipeline verify step
**Severity:** Blocks ME Reports P&L Combined tab
**Owner:** Farm + Convergence (cross-repo)

Farm ME triples are not landing in `convergence_triples` with the concepts Convergence's P&L engine expects: `revenue.total`, `cogs.total`, `opex.total`, `pnl.ebitda`.

**Full provenance captured by the verify step:**
- tenant_id: `69688df3-fc8e-51f8-a77c-9c13f9b3a784`
- engagement_id: `3c299509-3219-47ae-a751-9b554f60510a`
- pipeline_run_id: `8e4ebccf-a9cb-4049-aea8-51ce60d4db02`
- run_name: `MerCas-8e4e`
- acquirer/target: `meridian` / `cascadia`
- period: `2025-Q1`
- failing endpoint: `http://localhost:8010/api/convergence/reports/v2/combining/income-statement`
- failing status: HTTP 422 `data_incomplete`
- missing triples (meridian, 2025-Q1): `revenue.total`, `cogs.total`, `opex.total`, `pnl.ebitda`

**Diagnosis:** Concept-mapping bug between the Farm ME generator and the Convergence P&L engine. Farm generates triples under one set of concept names; Convergence P&L queries under another. The ME pipeline reports `farm_financials_a: 38350 accepted` and `farm_financials_b: 27192 accepted`, so ingest is working — names don't line up downstream.

**Scope for follow-up session:**
- Audit concept names emitted by Farm ME financials vs. names queried by Convergence `reports/v2/combining/income-statement`
- Decide authority: spec says Farm owns entity_id generation and DCL owns semantic resolution, but concept naming for P&L line items needs a canonical home
- Fix at the source (don't normalize at query time)
- Re-run ME pipeline; verify `convergence_surfaces_visible` goes green
- Add the Playwright spec that was deferred from this session, covering both SE and ME green paths
