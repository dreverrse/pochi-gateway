import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.security import compare_admin_tokens, require_admin
from app.db.repositories import get_summary, get_timeseries
from app.models.admin import LoginRequest, LoginResponse
from app.models.catalog import ModelCreate, ModelOut, ModelUpdate
from app.models.entities import Summary, TimeseriesPoint
from app.models.providers import ProviderCreate, ProviderOut, ProviderTestResult, ProviderUpdate
from app.models.usage import UsageLogsPage
from app.models.virtual_keys import (
    VirtualKeyCreate,
    VirtualKeyCreated,
    VirtualKeyOut,
    VirtualKeyUpdate,
)
from app.services import models as model_service
from app.services import providers as provider_service
from app.services import usage as usage_service
from app.services import virtual_keys as virtual_key_service
from app.services.models import (
    ModelNameConflictError,
    ModelNotFoundError,
    ModelProviderNotFoundError,
)
from app.services.providers import (
    ProviderNameConflictError,
    ProviderNotFoundError,
    ProviderSecretError,
)
from app.services.virtual_keys import (
    VirtualKeyModelError,
    VirtualKeyNotFoundError,
    VirtualKeyRevokedError,
)

public_router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


@public_router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request) -> LoginResponse:
    expected = getattr(request.app.state, "admin_token", "")
    if not compare_admin_tokens(payload.token, expected):
        time.sleep(0.25)
        raise HTTPException(
            status_code=401,
            detail="Admin token tidak valid",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return LoginResponse(ok=True)


@router.get("/summary", response_model=Summary)
def summary(days: int = Query(14, ge=1, le=90)) -> Summary:
    return get_summary(days=days)


@router.get("/usage/timeseries", response_model=list[TimeseriesPoint])
def usage_timeseries(days: int = Query(14, ge=1, le=90)) -> list[TimeseriesPoint]:
    return get_timeseries(days=days)


@router.get("/usage/logs", response_model=UsageLogsPage)
def usage_logs(
    days: int = Query(14, ge=1, le=90),
    status: Literal["all", "success", "error"] = Query("all"),
    model: str | None = Query(None, max_length=100),
    key_id: int | None = Query(None, gt=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> UsageLogsPage:
    return usage_service.list_logs(
        days=days,
        status=status,
        model=model,
        key_id=key_id,
        page=page,
        page_size=page_size,
    )


@router.get("/providers", response_model=list[ProviderOut])
def providers() -> list[ProviderOut]:
    return provider_service.list_providers()


@router.post("/providers", response_model=ProviderOut, status_code=201)
def create_provider(payload: ProviderCreate) -> ProviderOut:
    try:
        return provider_service.create_provider(payload)
    except ProviderNameConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ProviderSecretError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/providers/{provider_id}", response_model=ProviderOut)
def update_provider(provider_id: int, payload: ProviderUpdate) -> ProviderOut:
    try:
        return provider_service.update_provider(provider_id, payload)
    except ProviderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProviderNameConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ProviderSecretError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/providers/{provider_id}/test", response_model=ProviderTestResult)
def test_provider(provider_id: int) -> ProviderTestResult:
    try:
        return provider_service.test_provider(provider_id)
    except ProviderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/models", response_model=list[ModelOut])
def models() -> list[ModelOut]:
    return model_service.list_models()


@router.post("/models", response_model=ModelOut, status_code=201)
def create_model(payload: ModelCreate) -> ModelOut:
    try:
        return model_service.create_model(payload)
    except ModelProviderNotFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelNameConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/models/{model_id}", response_model=ModelOut)
def update_model(model_id: int, payload: ModelUpdate) -> ModelOut:
    try:
        return model_service.update_model(model_id, payload)
    except ModelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ModelProviderNotFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelNameConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/keys", response_model=list[VirtualKeyOut])
def keys() -> list[VirtualKeyOut]:
    return virtual_key_service.list_keys()


@router.post("/keys", response_model=VirtualKeyCreated, status_code=201)
def create_key(payload: VirtualKeyCreate) -> VirtualKeyCreated:
    try:
        return virtual_key_service.create_key(payload)
    except VirtualKeyModelError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/keys/{key_id}", response_model=VirtualKeyOut)
def update_key(key_id: int, payload: VirtualKeyUpdate) -> VirtualKeyOut:
    try:
        return virtual_key_service.update_key(key_id, payload)
    except VirtualKeyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except VirtualKeyRevokedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except VirtualKeyModelError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/keys/{key_id}/revoke", response_model=VirtualKeyOut)
def revoke_key(key_id: int) -> VirtualKeyOut:
    try:
        return virtual_key_service.revoke_key(key_id)
    except VirtualKeyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
