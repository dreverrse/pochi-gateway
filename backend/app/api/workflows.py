import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError

from app.core.security import LoginThrottle, require_admin
from app.db import workflow_repository
from app.models.workflows import (
    WorkflowCreate,
    WorkflowDefinition,
    WorkflowOut,
    WorkflowRunOut,
    WorkflowRunRequest,
    WorkflowRunSummary,
    WorkflowUpdate,
)
from app.services import workflows as workflow_service

router = APIRouter(
    prefix="/api/v1/admin/workflows",
    tags=["workflows"],
    dependencies=[Depends(require_admin)],
)

hooks_router = APIRouter(prefix="/api/v1/hooks", tags=["workflows"])

hook_throttle = LoginThrottle(max_attempts=30, window_seconds=60)
MAX_HOOK_BODY = 32 * 1024


def _has_webhook_trigger(definition: dict) -> bool:
    return any(
        node.get("type") == "trigger.webhook" for node in definition.get("nodes", [])
    )


def _validated(definition: WorkflowDefinition) -> dict:
    try:
        workflow_service.validate_definition(definition)
    except workflow_service.WorkflowValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return definition.model_dump()


@router.get("", response_model=list[WorkflowOut])
def list_workflows() -> list[dict]:
    return workflow_repository.list_workflows()


@router.post("", response_model=WorkflowOut, status_code=201)
def create_workflow(payload: WorkflowCreate) -> dict:
    definition = _validated(payload.definition)
    token = secrets.token_urlsafe(24) if _has_webhook_trigger(definition) else None
    workflow_id = workflow_repository.create_workflow(
        name=payload.name,
        description=payload.description,
        enabled=payload.enabled,
        definition=definition,
        webhook_token=token,
    )
    created = workflow_repository.get_workflow(workflow_id)
    if created is None:
        raise HTTPException(status_code=500, detail="Gagal menyimpan workflow")
    return created


@router.get("/runs/{run_id}", response_model=WorkflowRunOut)
def get_run(run_id: int) -> dict:
    run = workflow_repository.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run tidak ditemukan")
    return run


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(workflow_id: int) -> dict:
    workflow = workflow_repository.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan")
    return workflow


@router.patch("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(workflow_id: int, payload: WorkflowUpdate) -> dict:
    existing = workflow_repository.get_workflow(workflow_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan")

    definition = None
    if payload.definition is not None:
        definition = _validated(payload.definition)

    token = None
    if definition is not None and _has_webhook_trigger(definition):
        token = existing["webhook_token"] or secrets.token_urlsafe(24)

    fields: dict = {}
    if payload.name is not None:
        fields["name"] = payload.name
    if payload.description is not None:
        fields["description"] = payload.description
    if payload.enabled is not None:
        fields["enabled"] = payload.enabled

    workflow_repository.update_workflow(workflow_id, fields, definition, token)
    updated = workflow_repository.get_workflow(workflow_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan")
    return updated


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: int) -> None:
    if not workflow_repository.delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan")


@router.post("/{workflow_id}/run", response_model=WorkflowRunOut)
def run_workflow(workflow_id: int, payload: WorkflowRunRequest | None = None) -> dict:
    workflow = workflow_repository.get_workflow_row(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan")
    if not workflow["enabled"]:
        raise HTTPException(status_code=409, detail="Workflow sedang nonaktif")

    input_data = (payload.input if payload else {}) or {}
    try:
        run_id = workflow_service.run_workflow(workflow, "manual", input_data)
    except workflow_service.WorkflowValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    run = workflow_repository.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=500, detail="Gagal membaca hasil run")
    return run


@router.get("/{workflow_id}/runs", response_model=list[WorkflowRunSummary])
def list_runs(workflow_id: int, limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    if workflow_repository.get_workflow_row(workflow_id) is None:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan")
    return workflow_repository.list_runs(workflow_id, limit)


@hooks_router.post("/{token}")
async def webhook_trigger(token: str, request: Request) -> dict:
    if len(token) > 120:
        raise HTTPException(status_code=404, detail="Webhook tidak ditemukan")
    client_host = request.client.host if request.client else "unknown"
    retry_after = hook_throttle.retry_after(client_host)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak panggilan webhook.",
            headers={"Retry-After": str(retry_after)},
        )

    body = await request.body()
    if len(body) > MAX_HOOK_BODY:
        raise HTTPException(status_code=413, detail="Body webhook terlalu besar")
    try:
        payload = json.loads(body) if body else {}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Body webhook harus JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Body webhook harus objek JSON")

    workflow = workflow_repository.get_workflow_by_token(token)
    if workflow is None or not workflow["enabled"]:
        raise HTTPException(status_code=404, detail="Webhook tidak ditemukan")

    try:
        run_id = workflow_service.run_workflow(workflow, "webhook", payload)
    except (workflow_service.WorkflowValidationError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    run = workflow_repository.get_run(run_id)
    hook_throttle.record(client_host)
    return {
        "run_id": run_id,
        "status": run["status"] if run else "unknown",
        "error": run["error"] if run else None,
    }
