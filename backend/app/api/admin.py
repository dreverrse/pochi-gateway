import asyncio
import time
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response

from app.core.config import settings as app_settings
from app.core.security import (
    LoginThrottle,
    compare_admin_tokens,
    require_admin,
)
from app.db.repositories import get_summary, get_timeseries
from app.models.admin import LoginRequest, LoginResponse
from app.models.analytics import AnalyticsOut, ProviderUsageOut
from app.models.catalog import ModelCreate, ModelOut, ModelUpdate, PriceHistoryOut
from app.models.conversations import (
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationUpdate,
)
from app.models.entities import Summary, TimeseriesPoint
from app.models.gateway import ChatCompletionRequest, DashboardChatRequest
from app.models.providers import (
    ProviderCreate,
    ProviderOut,
    ProviderTemplateOut,
    ProviderTestResult,
    ProviderUpdate,
)
from app.models.settings import SettingsOut
from app.models.usage import UsageLogsPage
from app.models.virtual_keys import (
    VirtualKeyCreate,
    VirtualKeyCreated,
    VirtualKeyOut,
    VirtualKeyUpdate,
)
from app.services import analytics as analytics_service
from app.services import conversations as conversation_service
from app.services import gateway as gateway_service
from app.services import models as model_service
from app.services import providers as provider_service
from app.services import usage as usage_service
from app.services import provider_templates as provider_template_service
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

login_throttle = LoginThrottle()

# Stream chat yang sedang berjalan, per conversation. Dipakai endpoint /stop
# supaya tombol Stop tetap bekerja walau proxy di depan (Vite, nginx) tidak
# meneruskan pemutusan koneksi klien. Satu proses uvicorn = satu peta.
_active_chats: dict[int, asyncio.Event] = {}


@public_router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request) -> LoginResponse:
    client_host = request.client.host if request.client else "unknown"
    retry_after = login_throttle.retry_after(client_host)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak percobaan login. Coba lagi nanti.",
            headers={"Retry-After": str(retry_after)},
        )

    expected = getattr(request.app.state, "admin_token", "")
    if not compare_admin_tokens(payload.token, expected):
        login_throttle.register_failure(client_host)
        time.sleep(0.25)
        raise HTTPException(
            status_code=401,
            detail="Admin token tidak valid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    login_throttle.reset(client_host)
    return LoginResponse(ok=True)


@router.get("/summary", response_model=Summary)
def summary(
    days: int | None = Query(None, ge=1, le=90),
    hours: int | None = Query(None, ge=1, le=2160),
) -> Summary:
    return get_summary(days=days, hours=hours)


@router.get("/usage/timeseries", response_model=list[TimeseriesPoint])
def usage_timeseries(
    days: int | None = Query(None, ge=1, le=90),
    hours: int | None = Query(None, ge=1, le=2160),
) -> list[TimeseriesPoint]:
    return get_timeseries(days=days, hours=hours)


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(
    days: int | None = Query(None, ge=1, le=90),
    hours: int | None = Query(None, ge=1, le=2160),
    status: Literal["all", "success", "error"] = Query("all"),
    provider_id: int | None = Query(None, gt=0),
    model: str | None = Query(None, max_length=100),
    key_id: int | None = Query(None, gt=0),
) -> AnalyticsOut:
    return analytics_service.get_analytics(
        days=days,
        hours=hours,
        status=status,
        provider_id=provider_id,
        model=model,
        key_id=key_id,
    )


@router.get("/providers/stats", response_model=list[ProviderUsageOut])
def provider_stats(
    days: int | None = Query(None, ge=1, le=90),
    hours: int | None = Query(None, ge=1, le=2160),
) -> list[ProviderUsageOut]:
    return analytics_service.list_provider_usage(days=days, hours=hours)


@router.get("/settings", response_model=SettingsOut)
def runtime_settings() -> SettingsOut:
    return SettingsOut(
        app_name=app_settings.app_name,
        app_version=app_settings.app_version,
        rate_limit_rpm=app_settings.gateway_rate_limit_rpm,
        provider_timeout_seconds=app_settings.provider_timeout_seconds,
        gateway_timeout_seconds=app_settings.gateway_timeout_seconds,
        gateway_connect_timeout_seconds=app_settings.gateway_connect_timeout_seconds,
        allow_private_provider_urls=app_settings.allow_private_provider_urls,
        cors_origins=list(app_settings.cors_origins),
    )


@router.get("/prices/history", response_model=list[PriceHistoryOut])
def price_history(
    provider_model: str = Query(..., max_length=200),
) -> list[PriceHistoryOut]:
    return model_service.price_history(provider_model)


@router.get("/usage/export")
def export_usage(
    format: Literal["csv", "json"] = Query("csv"),
    days: int | None = Query(None, ge=1, le=90),
    hours: int | None = Query(None, ge=1, le=2160),
    status: Literal["all", "success", "error"] = Query("all"),
    model: str | None = Query(None, max_length=100),
    key_id: int | None = Query(None, gt=0),
    provider_id: int | None = Query(None, gt=0),
    search: str | None = Query(None, max_length=200),
) -> Response:
    filename, media_type, content = usage_service.export_logs(
        format=format,
        days=days,
        hours=hours,
        status=status,
        model=model,
        key_id=key_id,
        provider_id=provider_id,
        search=search,
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/usage/logs", response_model=UsageLogsPage)
def usage_logs(
    days: int | None = Query(None, ge=1, le=90),
    hours: int | None = Query(None, ge=1, le=2160),
    status: Literal["all", "success", "error"] = Query("all"),
    model: str | None = Query(None, max_length=100),
    key_id: int | None = Query(None, gt=0),
    provider_id: int | None = Query(None, gt=0),
    search: str | None = Query(None, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> UsageLogsPage:
    return usage_service.list_logs(
        days=days,
        hours=hours,
        status=status,
        model=model,
        key_id=key_id,
        page=page,
        page_size=page_size,
        provider_id=provider_id,
        search=search,
    )


@router.get("/provider-templates", response_model=list[ProviderTemplateOut])
def provider_templates() -> list[dict]:
    return provider_template_service.list_provider_templates()


@router.post("/chat")
async def dashboard_chat(payload: DashboardChatRequest, request: Request):
    """Chat dari dashboard. Memakai model gateway yang sama, tetapi tidak
    memerlukan virtual key: yang mengautentikasi adalah admin token router ini.
    Request tetap dicatat di usage logs dengan virtual_key_id NULL.

    Kalau `conversation_id` dikirim, server menyimpan pesan user sebelum
    streaming dan pesan asisten (beserta usage) setelah stream selesai —
    lewat callback gateway, jadi tidak ada pencatatan ganda di analytics."""
    request_id = f"chat_{uuid.uuid4().hex}"
    internal_key = gateway_service.AuthenticatedKey(
        id=None,
        name="Dashboard chat",
        allowed_models=(),
        budget_limit_usd=None,
        budget_period="monthly",
        rate_limit_rpm=None,
    )

    conversation_id = payload.conversation_id
    if conversation_id is not None:
        try:
            conversation_service.get_conversation(conversation_id)
        except conversation_service.ConversationNotFoundError:
            raise HTTPException(status_code=404, detail="Percakapan tidak ditemukan.")

    try:
        route = gateway_service.resolve_model(internal_key, payload.model)
    except gateway_service.GatewayError as exc:
        if conversation_id is not None:
            conversation_service.append_error_message(
                conversation_id,
                message=exc.message,
                model=payload.model,
            )
        return gateway_service.error_response(exc, request_id)

    if conversation_id is not None:
        if payload.user_message:
            conversation_service.append_user_message(
                conversation_id, payload.user_message, payload.model
            )
        else:
            conversation_service.touch(conversation_id, model=payload.model)

    forward = ChatCompletionRequest(
        model=payload.model,
        messages=payload.messages,
        stream=payload.stream,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
    )

    on_complete = None
    disconnect_check = request.is_disconnected
    if conversation_id is not None:
        stop_event = asyncio.Event()
        _active_chats[conversation_id] = stop_event

        async def disconnect_check(_event=stop_event):
            if _event.is_set():
                return True
            return await request.is_disconnected()

        def on_complete(
            info,
            _cid=conversation_id,
            _model=payload.model,
            _route=route,
            _event=stop_event,
        ):
            if _active_chats.get(_cid) is _event:
                _active_chats.pop(_cid, None)
            conversation_service.record_completion(
                _cid,
                info=info,
                model=_model,
                provider_model=_route.provider_model,
                provider_name=_route.provider_name,
            )

    def record_stopped() -> None:
        """Tutup pesan asisten sebagai "stopped" kalau klien pergi sebelum
        provider sempat mengirim byte pertama, supaya riwayat tidak menggantung
        dengan pesan user tanpa balasan."""
        if conversation_id is None:
            return
        _active_chats.pop(conversation_id, None)
        conversation_service.record_completion(
            conversation_id,
            info={
                "usage": None,
                "content": "",
                "duration_ms": None,
                "status": 499,
                "error_code": "client_disconnected",
                "cancelled": True,
            },
            model=payload.model,
            provider_model=route.provider_model,
            provider_name=route.provider_name,
        )

    try:
        response = await gateway_service.proxy_chat(
            internal_key,
            route,
            forward,
            request_id,
            on_complete=on_complete,
            disconnect_check=disconnect_check,
        )
    except asyncio.CancelledError:
        record_stopped()
        raise
    except gateway_service.ClientGoneError:
        record_stopped()
        return JSONResponse(
            status_code=499,
            content={
                "error": {
                    "message": "Permintaan dihentikan sebelum provider menjawab.",
                    "type": "client_disconnected",
                    "code": "client_disconnected",
                }
            },
        )

    if conversation_id is not None and response.status_code >= 400 and not payload.stream:
        conversation_service.append_error_message(
            conversation_id,
            message=f"Provider menolak permintaan (HTTP {response.status_code}).",
            model=payload.model,
            provider_name=route.provider_name,
        )

    return response


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(search: str | None = Query(None, max_length=120)) -> list[dict]:
    return conversation_service.list_conversations(search)


@router.post("/conversations", response_model=ConversationDetail, status_code=201)
def create_conversation(payload: ConversationCreate) -> dict:
    return conversation_service.create_conversation(
        title=payload.title,
        model=payload.model,
        system_prompt=payload.system_prompt,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: int) -> dict:
    try:
        return conversation_service.get_conversation_detail(conversation_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Percakapan tidak ditemukan.")


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
def update_conversation(conversation_id: int, payload: ConversationUpdate) -> dict:
    try:
        return conversation_service.update_conversation(
            conversation_id,
            payload.model_dump(exclude_unset=True),
        )
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Percakapan tidak ditemukan.")


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: int) -> Response:
    try:
        conversation_service.delete_conversation(conversation_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Percakapan tidak ditemukan.")
    return Response(status_code=204)


@router.post("/conversations/{conversation_id}/clear", response_model=ConversationDetail)
def clear_conversation(conversation_id: int) -> dict:
    try:
        return conversation_service.clear_messages(conversation_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Percakapan tidak ditemukan.")


@router.post("/conversations/{conversation_id}/stop", status_code=202)
async def stop_chat(conversation_id: int) -> dict:
    """Minta stream yang sedang berjalan untuk conversation ini berhenti.

    Tanpa ini, pemutusan fetch dari browser bisa tidak sampai ke uvicorn kalau
    ada reverse proxy di depan — provider tetap menagih sampai selesai."""
    event = _active_chats.get(conversation_id)
    if event is None:
        return {"stopped": False}
    event.set()
    # Beri kesempatan generator stream melihat event sebelum respons ini selesai.
    await asyncio.sleep(0)
    return {"stopped": True}


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}", status_code=204
)
def delete_conversation_message(conversation_id: int, message_id: int) -> Response:
    try:
        conversation_service.delete_message(conversation_id, message_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan.")
    return Response(status_code=204)


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
