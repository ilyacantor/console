"""Pydantic models for pipeline operations."""

from pydantic import BaseModel, Field


class RunPipelineRequest(BaseModel):
    mode: str = Field(..., pattern="^(SE|ME)$", description="Pipeline mode: SE or ME")
    entities: list[str] = Field(
        default_factory=lambda: ["meridian"],
        description="Entity IDs to process",
    )


class PipelineStepResult(BaseModel):
    name: str
    display_name: str
    status: str = "pending"  # pending, running, success, failed
    duration_s: float | None = None
    triples: int | None = None
    error: str | None = None
    detail: str | None = None


class PipelineRunResult(BaseModel):
    run_id: str
    mode: str
    entity_ids: list[str]
    steps: list[PipelineStepResult]
    total_duration_s: float | None = None
    total_triples: int | None = None
    status: str = "running"  # running, pass, fail
