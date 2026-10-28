import asyncio
import codecs
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi.responses import JSONResponse, Response, StreamingResponse

from app.core.config import settings
from app.core.security import SecretBoxError, get_secret_box, hash_api_key
from app.db import gateway_repository, provider_repository
from app.models.gateway import ChatCompletionRequest
from app.services import pricing as pricing_service
from app.services.adapters import get_adapter

logger = logging.getLogger(__name__)


class GatewayError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        code: str,
        error_type: str | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.error_type = error_type or (
            "server_error" if status_code >= 500 else "invalid_request_error"
        )
        self.headers = headers or {}


@dataclass(frozen=True)
class AuthenticatedKey:
    id: int
    name: str
    allowed_models: tuple[str, ...]
    budget_limit_usd: float | None
    budget_period: str


@dataclass
class ModelRoute:
    model_id: int
    public_name: str
    provider_model: str
    provider_id: int
    provider_name: str
    base_url: str
    adapter_type: str
    api_key: str = field(repr=False)


def _parse_allowed_models(value: str | None) -> tuple[str, ...]:
    try:
        models = json.loads(value or "[]")
    except (TypeError, ValueError):
        return ()
    if not isinstance(models, list):
        return ()
    return tuple(str(model) for model in models)


def authenticate(token: str) -> AuthenticatedKey:
    if not token:
        raise GatewayError(
            401,
            "Missing API key.",
            "invalid_api_key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    row = gateway_repository.find_virtual_key_by_hash(hash_api_key(token))
    if row is None or not row["enabled"] or row["revoked_at"] is not None:
        raise GatewayError(
            401,
            "Invalid API key.",
            "invalid_api_key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    gateway_repository.touch_virtual_key(row["id"])
    return AuthenticatedKey(
        id=row["id"],
        name=row["name"],
        allowed_models=_parse_allowed_models(row["allowed_models"]),
        budget_limit_usd=row["budget_limit_usd"],
        budget_period=row["budget_period"],
    )


def _created_epoch(value: str) -> int:
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return 0
    return int(parsed.timestamp())


def enforce_limits(virtual_key: AuthenticatedKey) -> None:
    limit = settings.gateway_rate_limit_rpm
    if limit > 0:
        now = time.time()
        window_start = int(now // 60) * 60
        count = gateway_repository.consume_rate_limit(virtual_key.id, window_start)
        if count > limit:
            retry_after = max(1, 60 - int(now % 60))
            raise GatewayError(
                429,
                f"Rate limit of {limit} requests per minute exceeded.",
                "rate_limit_exceeded",
                error_type="rate_limit_error",
                headers={"Retry-After": str(retry_after)},
            )

    if virtual_key.budget_limit_usd is None:
        return

    spend = gateway_repository.budget_spend(virtual_key.id, virtual_key.budget_period)
    if spend >= virtual_key.budget_limit_usd:
        raise GatewayError(
            429,
            "The budget limit for this API key has been reached.",
            "budget_exceeded",
            error_type="insufficient_quota",
        )


def list_models(virtual_key: AuthenticatedKey) -> dict[str, Any]:
    allowed = set(virtual_key.allowed_models)
    data = []
    for row in gateway_repository.list_available_models():
        if allowed and row["public_name"] not in allowed:
            continue
        data.append(
            {
                "id": row["public_name"],
                "object": "model",
                "created": _created_epoch(row["created_at"]),
                "owned_by": row["provider_name"],
            }
        )
    return {"object": "list", "data": data}


def resolve_model(virtual_key: AuthenticatedKey, public_name: str) -> ModelRoute:
    row = gateway_repository.get_model_route(public_name)
    if row is None or not row["model_enabled"]:
        raise GatewayError(
            404,
            f"Model '{public_name}' does not exist.",
            "model_not_found",
            error_type="invalid_request_error",
        )

    if virtual_key.allowed_models and public_name not in virtual_key.allowed_models:
        raise GatewayError(
            403,
            f"This API key is not allowed to use model '{public_name}'.",
            "model_not_allowed",
            error_type="permission_error",
        )

    if not row["provider_enabled"] or not row["has_secret"]:
        raise GatewayError(
            503,
            "This model is temporarily unavailable.",
            "provider_unavailable",
            error_type="server_error",
        )

    secret = provider_repository.get_provider_secret(row["provider_id"])
    if secret is None:
        raise GatewayError(
            503,
            "This model is temporarily unavailable.",
            "provider_unavailable",
            error_type="server_error",
        )

    try:
        api_key = get_secret_box().decrypt(secret["ciphertext"])
    except SecretBoxError:
        raise GatewayError(
            503,
            "This model is temporarily unavailable.",
            "provider_unavailable",
            error_type="server_error",
        ) from None

    if not api_key:
        raise GatewayError(
            503,
            "This model is temporarily unavailable.",
            "provider_unavailable",
            error_type="server_error",
        )

    return ModelRoute(
        model_id=row["model_id"],
        public_name=row["public_name"],
        provider_model=row["provider_model"],
        provider_id=row["provider_id"],
        provider_name=row["provider_name"],
        base_url=row["base_url"],
        adapter_type=row["adapter_type"],
        api_key=api_key,
    )


def error_response(error: GatewayError, request_id: str) -> JSONResponse:
    headers = {"X-Pochi-Request-Id": request_id}
    headers.update(error.headers)
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "message": error.message,
                "type": error.error_type,
                "param": None,
                "code": error.code,
            }
        },
        headers=headers,
    )


def _non_negative_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return max(value, 0)
    if isinstance(value, float) and value >= 0:
        return int(value)
    return None


def extract_usage(payload: Any) -> tuple[int, int] | None:
    if not isinstance(payload, dict):
        return None
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return None

    input_tokens = _non_negative_int(
        usage.get("prompt_tokens", usage.get("input_tokens"))
    )
    output_tokens = _non_negative_int(
        usage.get("completion_tokens", usage.get("output_tokens"))
    )
    if input_tokens is None and output_tokens is None:
        return None
    return input_tokens or 0, output_tokens or 0


class SSEUsageParser:
    def __init__(self) -> None:
        self._decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self._buffer = ""
        self.usage: tuple[int, int] | None = None

    def feed(self, chunk: bytes) -> None:
        self._buffer += self._decoder.decode(chunk)
        self._consume(final=False)

    def close(self) -> None:
        self._buffer += self._decoder.decode(b"", final=True)
        self._consume(final=True)

    def _consume(self, final: bool) -> None:
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            self._handle_line(line)
        if final and self._buffer:
            self._handle_line(self._buffer)
            self._buffer = ""

    def _handle_line(self, line: str) -> None:
        line = line.rstrip("\r")
        if not line.startswith("data:"):
            return
        data = line[5:].strip()
        if not data or data == "[DONE]":
            return
        try:
            payload = json.loads(data)
        except ValueError:
            return
        usage = extract_usage(payload)
        if usage is not None:
            self.usage = usage


def _upstream_error_code(content: bytes, status_code: int) -> str:
    try:
        payload = json.loads(content.decode("utf-8", errors="replace"))
    except ValueError:
        return f"upstream_http_{status_code}"
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            code = error.get("code") or error.get("type")
            if code:
                return str(code)[:120]
        elif isinstance(error, str) and error:
            return error[:120]
    return f"upstream_http_{status_code}"


def _safe_log(
    request_id: str,
    virtual_key: AuthenticatedKey,
    route: ModelRoute,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float | None,
    cost_status: str,
    status_code: int,
    duration_ms: int,
    streamed: bool,
    error_code: str | None,
    created_at: datetime,
) -> None:
    try:
        gateway_repository.create_request_log(
            request_id=request_id,
            virtual_key_id=virtual_key.id,
            provider_id=route.provider_id,
            public_model=route.public_name,
            provider_model=route.provider_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            cost_status=cost_status,
            status_code=status_code,
            duration_ms=duration_ms,
            streamed=streamed,
            error_code=error_code,
            created_at=created_at,
            finished_at=datetime.now(timezone.utc),
        )
    except Exception as exc:
        logger.warning(
            "Gagal menyimpan request log %s: %s",
            request_id,
            type(exc).__name__,
        )


async def _close_response(response: httpx.Response | None, client: httpx.AsyncClient) -> None:
    if response is not None:
        try:
            await response.aclose()
        except BaseException:
            pass
    try:
        await client.aclose()
    except BaseException:
        pass


def _timeout() -> httpx.Timeout:
    return httpx.Timeout(
        settings.gateway_timeout_seconds,
        connect=settings.gateway_connect_timeout_seconds,
    )


async def proxy_chat(
    virtual_key: AuthenticatedKey,
    route: ModelRoute,
    payload: ChatCompletionRequest,
    request_id: str,
) -> Response:
    adapter = get_adapter(route.adapter_type)
    body = payload.model_dump(exclude_unset=True, exclude_none=True)
    body["model"] = route.provider_model
    body = adapter.prepare_body(body)

    url = adapter.chat_completions_url(route.base_url)
    headers = adapter.headers(route.api_key, payload.stream)
    created_at = datetime.now(timezone.utc)
    started = time.perf_counter()

    client = httpx.AsyncClient(
        timeout=_timeout(),
        follow_redirects=False,
        trust_env=False,
    )

    try:
        request = client.build_request("POST", url, json=body, headers=headers)
        response = await client.send(request, stream=payload.stream)
    except httpx.TimeoutException:
        await _close_response(None, client)
        duration_ms = int((time.perf_counter() - started) * 1000)
        _safe_log(
            request_id,
            virtual_key,
            route,
            0,
            0,
            0.0,
            "known",
            504,
            duration_ms,
            payload.stream,
            "gateway_timeout",
            created_at,
        )
        return error_response(
            GatewayError(
                504,
                "Provider request timed out.",
                "gateway_timeout",
                error_type="server_error",
            ),
            request_id,
        )
    except httpx.HTTPError:
        await _close_response(None, client)
        duration_ms = int((time.perf_counter() - started) * 1000)
        _safe_log(
            request_id,
            virtual_key,
            route,
            0,
            0,
            0.0,
            "known",
            502,
            duration_ms,
            payload.stream,
            "provider_connection_error",
            created_at,
        )
        return error_response(
            GatewayError(
                502,
                "Could not connect to the provider.",
                "provider_connection_error",
                error_type="server_error",
            ),
            request_id,
        )
    except Exception:
        await _close_response(None, client)
        duration_ms = int((time.perf_counter() - started) * 1000)
        _safe_log(
            request_id,
            virtual_key,
            route,
            0,
            0,
            0.0,
            "known",
            502,
            duration_ms,
            payload.stream,
            "gateway_error",
            created_at,
        )
        return error_response(
            GatewayError(
                502,
                "The gateway could not complete the request.",
                "gateway_error",
                error_type="server_error",
            ),
            request_id,
        )

    content_type = response.headers.get("content-type")

    if not 200 <= response.status_code < 300:
        content = await response.aread()
        await _close_response(response, client)
        error_code = _upstream_error_code(content, response.status_code)
        duration_ms = int((time.perf_counter() - started) * 1000)
        _safe_log(
            request_id,
            virtual_key,
            route,
            0,
            0,
            0.0,
            "known",
            response.status_code,
            duration_ms,
            payload.stream,
            error_code,
            created_at,
        )

        if not content:
            content = json.dumps(
                {
                    "error": {
                        "message": f"Provider returned HTTP {response.status_code}.",
                        "type": "upstream_error",
                        "param": None,
                        "code": error_code,
                    }
                }
            ).encode("utf-8")
            content_type = "application/json"

        return Response(
            content=content,
            status_code=response.status_code,
            media_type=content_type,
            headers={"X-Pochi-Request-Id": request_id},
        )

    if payload.stream:
        parser = SSEUsageParser()

        async def stream_body():
            cancelled = False
            log_status = response.status_code
            error_code = None
            try:
                async for chunk in response.aiter_bytes():
                    parser.feed(chunk)
                    yield chunk
            except asyncio.CancelledError:
                cancelled = True
                error_code = "client_disconnected"
                raise
            except httpx.TimeoutException:
                log_status = 504
                error_code = "stream_timeout"
                raise
            except Exception:
                log_status = 502
                error_code = "stream_error"
                raise
            finally:
                parser.close()
                try:
                    await response.aclose()
                except BaseException:
                    pass
                try:
                    await client.aclose()
                except BaseException:
                    pass

                input_tokens, output_tokens = parser.usage or (0, 0)
                duration_ms = int((time.perf_counter() - started) * 1000)
                success = 200 <= log_status < 300 and not cancelled
                if success and parser.usage is not None:
                    cost_usd, cost_status = pricing_service.calculate_cost(
                        route.provider_model,
                        input_tokens,
                        output_tokens,
                    )
                elif success:
                    cost_usd, cost_status = None, "unknown"
                else:
                    cost_usd, cost_status = 0.0, "known"
                _safe_log(
                    request_id,
                    virtual_key,
                    route,
                    input_tokens,
                    output_tokens,
                    cost_usd,
                    cost_status,
                    499 if cancelled else log_status,
                    duration_ms,
                    True,
                    error_code,
                    created_at,
                )

        return StreamingResponse(
            stream_body(),
            status_code=response.status_code,
            media_type=content_type or "text/event-stream",
            headers={
                "X-Pochi-Request-Id": request_id,
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    content = response.content
    usage = None
    try:
        usage = extract_usage(json.loads(content.decode("utf-8")))
    except (UnicodeDecodeError, ValueError):
        usage = None

    await _close_response(response, client)
    input_tokens, output_tokens = usage or (0, 0)
    duration_ms = int((time.perf_counter() - started) * 1000)
    if usage is not None:
        cost_usd, cost_status = pricing_service.calculate_cost(
            route.provider_model,
            input_tokens,
            output_tokens,
        )
    else:
        cost_usd, cost_status = None, "unknown"
    _safe_log(
        request_id,
        virtual_key,
        route,
        input_tokens,
        output_tokens,
        cost_usd,
        cost_status,
        response.status_code,
        duration_ms,
        False,
        None,
        created_at,
    )

    return Response(
        content=content,
        status_code=response.status_code,
        media_type=content_type,
        headers={"X-Pochi-Request-Id": request_id},
    )
