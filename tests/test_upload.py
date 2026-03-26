"""Tests for upload routes — file upload, parsing, validation."""

import io
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

SAMPLE_CSV = "Account Number,Account Name,Period,Debit,Credit\n1000,Cash,2025-Q1,100000,0\n2000,Revenue,2025-Q1,0,100000\n"
MISSING_COLS_CSV = "Name,Value\nFoo,123\nBar,456\n"


@patch("backend.app.routes.upload.db.update_upload")
@patch("backend.app.routes.upload.db.get_upload")
@patch("backend.app.routes.upload.db.save_upload")
def test_upload_csv(mock_save, mock_get, mock_update):
    """POST /api/upload with a simple CSV returns upload_id and parsed status."""
    mock_save.return_value = "upload-001"
    mock_update.return_value = None
    mock_get.return_value = {
        "upload_id": "upload-001",
        "engagement_id": None,
        "entity_id": "meridian",
        "file_name": "gl_meridian.csv",
        "file_type": "gl",
        "file_size": len(SAMPLE_CSV),
        "parse_result": {
            "file_name": "gl_meridian.csv",
            "file_type": "gl",
            "rows": 2,
            "accounts": 2,
            "periods": 1,
            "format": "separate_dr_cr",
            "validations": [
                {"check": "Account numbers present", "pass": True, "detail": "2 unique"},
                {"check": "Period column detected", "pass": True, "detail": "Quarterly, 1 periods"},
                {"check": "Debit/credit columns", "pass": True, "detail": "Separate columns"},
                {"check": "Trial balance nets to zero", "pass": True, "detail": "$0.00 variance"},
            ],
        },
        "status": "parsed",
        "created_at": "2026-03-25T10:00:00+00:00",
    }

    resp = client.post(
        "/api/upload",
        files={"file": ("gl_meridian.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")},
        data={"entity_id": "meridian"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["upload_id"] == "upload-001"
    assert data["status"] == "parsed"
    assert data["entity_id"] == "meridian"


@patch("backend.app.routes.upload.db.update_upload")
@patch("backend.app.routes.upload.db.get_upload")
@patch("backend.app.routes.upload.db.save_upload")
def test_upload_status(mock_save, mock_get, mock_update):
    """GET /api/upload/status returns validation results."""
    mock_get.return_value = {
        "upload_id": "upload-002",
        "engagement_id": None,
        "entity_id": "cascadia",
        "file_name": "gl_cascadia.csv",
        "file_type": "gl",
        "file_size": 500,
        "parse_result": {
            "rows": 10,
            "validations": [{"check": "Account numbers present", "pass": True, "detail": "5 unique"}],
        },
        "status": "parsed",
        "created_at": "2026-03-25T10:00:00+00:00",
    }

    resp = client.get("/api/upload/status/upload-002")
    assert resp.status_code == 200
    data = resp.json()
    assert data["upload_id"] == "upload-002"
    assert data["parse_result"]["rows"] == 10
    assert len(data["parse_result"]["validations"]) == 1


@patch("backend.app.routes.upload.db.update_upload")
@patch("backend.app.routes.upload.db.get_upload")
@patch("backend.app.routes.upload.db.save_upload")
def test_upload_missing_columns(mock_save, mock_get, mock_update):
    """Upload with missing columns surfaces validation failures."""
    mock_save.return_value = "upload-003"
    mock_update.return_value = None
    mock_get.return_value = {
        "upload_id": "upload-003",
        "engagement_id": None,
        "entity_id": "meridian",
        "file_name": "bad_data.csv",
        "file_type": "gl",
        "file_size": len(MISSING_COLS_CSV),
        "parse_result": {
            "file_name": "bad_data.csv",
            "file_type": "gl",
            "rows": 2,
            "accounts": 0,
            "periods": 0,
            "format": "unknown",
            "validations": [
                {"check": "Account numbers present", "pass": False, "detail": "No account number column detected"},
                {"check": "Period column detected", "pass": False, "detail": "No period column detected"},
                {"check": "Debit/credit columns", "pass": False, "detail": "No debit/credit or net amount column detected"},
                {"check": "Trial balance nets to zero", "pass": False, "detail": "Cannot check — no amount columns"},
            ],
        },
        "status": "parsed_with_warnings",
        "created_at": "2026-03-25T10:00:00+00:00",
    }

    resp = client.post(
        "/api/upload",
        files={"file": ("bad_data.csv", io.BytesIO(MISSING_COLS_CSV.encode()), "text/csv")},
        data={"entity_id": "meridian"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "parsed_with_warnings"
    validations = data["parse_result"]["validations"]
    failed = [v for v in validations if not v["pass"]]
    assert len(failed) >= 3


@patch("backend.app.routes.upload.db.get_upload")
def test_upload_status_not_found(mock_get):
    """GET /api/upload/status for unknown ID returns 404."""
    mock_get.return_value = None
    resp = client.get("/api/upload/status/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@patch("backend.app.routes.upload.db.update_upload")
@patch("backend.app.routes.upload.db.get_upload")
def test_proceed_upload(mock_get, mock_update):
    """POST /api/upload/proceed triggers conversion stub."""
    mock_get.return_value = {
        "upload_id": "upload-004",
        "engagement_id": None,
        "entity_id": "meridian",
        "file_name": "gl.csv",
        "file_type": "gl",
        "file_size": 500,
        "parse_result": {"rows": 10, "accounts": 5},
        "status": "parsed",
        "created_at": None,
    }
    mock_update.return_value = None

    resp = client.post("/api/upload/proceed/upload-004")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converted"
    assert "conversion" in data


def test_upload_unsupported_format():
    """Upload with unsupported file format returns 400."""
    resp = client.post(
        "/api/upload",
        files={"file": ("data.json", io.BytesIO(b'{"a":1}'), "application/json")},
        data={"entity_id": "meridian"},
    )
    assert resp.status_code == 400
