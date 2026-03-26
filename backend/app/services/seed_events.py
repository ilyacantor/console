"""Seed change events for first startup."""

from datetime import datetime, timedelta, timezone

_now = datetime.now(timezone.utc)

SEED_EVENTS: list[dict] = [
    {
        "timestamp": _now - timedelta(hours=2),
        "source_module": "aam",
        "event_type": "schema_drift",
        "entity_id": None,
        "summary": "Schema drift: ERP — 3 fields removed",
        "detail": "NetSuite ERP pipe detected removal of 3 fields during scheduled schema check",
        "severity": "critical",
        "payload": {
            "pipe": "erp_netsuite_main",
            "previous_field_count": 47,
            "current_field_count": 44,
            "removed_fields": ["vendor_tier", "po_approval_chain", "cost_center_l3"],
            "confidence_impact": {"procurement": -0.08, "opex": -0.05},
        },
    },
    {
        "timestamp": _now - timedelta(hours=2, minutes=1),
        "source_module": "dcl",
        "event_type": "coverage_drop",
        "entity_id": None,
        "summary": "Coverage drop: opex domain 98% to 84%",
        "detail": "Operating expense domain coverage fell below critical threshold after upstream schema change",
        "severity": "critical",
        "payload": {
            "domain": "opex",
            "previous_coverage": 98.0,
            "current_coverage": 84.0,
            "drop_percent": 14.0,
            "concepts_lost": ["cost_center_l3_allocation", "vendor_tier_mapping", "approval_chain_cost"],
        },
    },
    {
        "timestamp": _now - timedelta(hours=5),
        "source_module": "aod",
        "event_type": "asset_discovered",
        "entity_id": None,
        "summary": "New asset discovered: datadog.com",
        "detail": "Shadow IT detection flagged new SaaS asset not in approved vendor list",
        "severity": "warning",
        "payload": {
            "asset": "datadog.com",
            "category": "observability",
            "classification": "shadow_it",
            "monthly_spend_estimate": 12400,
        },
    },
    {
        "timestamp": _now - timedelta(hours=6),
        "source_module": "aam",
        "event_type": "endpoint_drift",
        "entity_id": None,
        "summary": "Endpoint drift: Salesforce API version upgraded",
        "detail": "Salesforce CRM pipe detected API version change from v58.0 to v60.0",
        "severity": "warning",
        "payload": {
            "pipe": "crm_salesforce_main",
            "previous_version": "v58.0",
            "current_version": "v60.0",
        },
    },
    {
        "timestamp": _now - timedelta(hours=7),
        "source_module": "dcl",
        "event_type": "source_stale",
        "entity_id": None,
        "summary": "Source freshness: HCM data stale (72h)",
        "detail": "HCM data source has not refreshed in 72 hours, exceeding 48h staleness threshold",
        "severity": "warning",
        "payload": {
            "source": "hcm_workday",
            "hours_stale": 72,
            "staleness_threshold_hours": 48,
            "triples_affected": 1240,
        },
    },
    {
        "timestamp": _now - timedelta(hours=8),
        "source_module": "aod",
        "event_type": "discovery_scan",
        "entity_id": None,
        "summary": "Discovery scan complete: 429 assets, 0 net change",
        "detail": "Scheduled discovery scan completed with no new or removed assets",
        "severity": "info",
        "payload": {
            "asset_count": 429,
            "scan_duration_s": 34.2,
            "net_change": 0,
        },
    },
    {
        "timestamp": _now - timedelta(hours=14),
        "source_module": "aam",
        "event_type": "health_check",
        "entity_id": None,
        "summary": "Pipe health check: 101/101 healthy",
        "detail": "All declared pipes passed health check",
        "severity": "info",
        "payload": {
            "healthy_count": 101,
            "total_count": 101,
        },
    },
]
