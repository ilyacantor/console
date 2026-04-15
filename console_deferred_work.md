# Deferred work — console

1. 2026-04-09 | https://claude.ai/chat/e68ee425-14aa-40ae-8963-bd873d66f0f4 | new pipeline DAG stage | multi_entity_overlay stage post batch_manifest_intake. Calls Farm /generate-multi-entity-triples then push to canonical store (DCL vs Convergence TBC for customer.* triples). Own namespaced stage ID, fail-loud on Farm error, no silent skip on empty overlay JSONL. Option 1 chosen but not executed. Severity: blocker. Blocking: customer profile fields silently empty across all historical runs; cross-sell scoring stuck at 31/100 baseline.
