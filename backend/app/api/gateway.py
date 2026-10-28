import uuid

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.repositories import ping
from app.models.gateway import ChatCompletionRequest
from app.services import gateway as gateway_service

router = APIRouter(tags=["gateway"])


def _request_id() -> str:
    return f"req_{uuid.uuid4().hex}"


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return value.strip()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "database": "ok" if ping() else "unavailable",
    }


@router.get("/v1/models")
def models(authorization: str | None = Header(default=None)):
    request_id = _request_id()
    try:
        virtual_key = gateway_service.authenticate(_bearer_token(authorization))
    except gateway_service.GatewayError as exc:
        return gateway_service.error_response(exc, request_id)

    return JSONResponse(
        content=gateway_service.list_models(virtual_key),
        headers={"X-Pochi-Request-Id": request_id},
    )


@router.post("/v1/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    authorization: str | None = Header(default=None),
):
    request_id = _request_id()
    try:
        virtual_key = gateway_service.authenticate(_bearer_token(authorization))
        route = gateway_service.resolve_model(virtual_key, payload.model)
        gateway_service.enforce_limits(virtual_key)
    except gateway_service.GatewayError as exc:
        return gateway_service.error_response(exc, request_id)

    return await gateway_service.proxy_chat(virtual_key, route, payload, request_id)
