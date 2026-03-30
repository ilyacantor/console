"""Pydantic models for pipeline operations — matches Platform's operator models."""

from enum import Enum
from typing import Any

from pydantic import BaseModel


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class PipelineMode(str, Enum):
    SE = "se"
    ME = "me"


class ExecutionMode(str, Enum):
    BATCH = "batch"
    STEP = "step"


class PipelineStep(BaseModel):
    name: str
    display_name: str
    status: StepStatus = StepStatus.PENDING
    message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    duration_ms: int | None = None
    data: dict[str, Any] | None = None
    parallel_group: str | None = None
    provenance_tag: str | None = None


class PipelineJob(BaseModel):
    pipeline_run_id: str
    run_name: str = ""
    pipeline_mode: PipelineMode
    execution_mode: ExecutionMode
    status: str = "pending"
    started_at: str
    completed_at: str | None = None
    steps: list[PipelineStep]
    current_step: int = 0
    total_steps: int
    message: str = "Pipeline created"
    config: dict[str, Any] = {}


class ServiceHealth(BaseModel):
    service: str
    url: str
    healthy: bool
    status_code: int | None = None
    latency_ms: float | None = None
    error: str | None = None


class StartPipelineRequest(BaseModel):
    mode: PipelineMode
    execution: ExecutionMode
    config: dict[str, Any] | None = None


class StartPipelineResponse(BaseModel):
    pipeline_run_id: str
    run_name: str
    status: str
    message: str
