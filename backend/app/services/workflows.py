import ipaddress
import json
import re
import socket
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.db import gateway_repository, workflow_repository
from app.models.workflows import WorkflowDefinition, WorkflowNode
from app.services import gateway as gateway_service
from app.services.adapters import get_adapter
from app.services.pricing import calculate_cost

MAX_HTTP_BYTES = 256 * 1024
MAX_OUTPUT_TEXT = 4000
TEMPLATE = re.compile(r"\{\{\s*([a-zA-Z0-9_.\[\]-]+)\s*\}\}")
CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

CONDITION_OPERATORS = {
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "gt",
    "lt",
    "is_empty",
    "is_not_empty",
}

TRIGGER_TYPES = {"trigger.manual", "trigger.schedule", "trigger.webhook"}


class WorkflowValidationError(Exception):
    pass


class WorkflowRunError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _clean(value: str, limit: int = 300) -> str:
    cleaned = CONTROL_CHARACTERS.sub("", str(value)).strip()
    return cleaned[:limit] or "Kesalahan tanpa pesan"


def validate_definition(definition: WorkflowDefinition) -> None:
    nodes = {node.id: node for node in definition.nodes}
    triggers = [node for node in definition.nodes if node.type in TRIGGER_TYPES]
    if len(triggers) != 1:
        raise WorkflowValidationError("Workflow harus punya tepat satu trigger")
    if not definition.nodes:
        raise WorkflowValidationError("Workflow masih kosong")

    for edge in definition.edges:
        if edge.source not in nodes or edge.target not in nodes:
            raise WorkflowValidationError("Edge menunjuk node yang tidak ada")
        if edge.source == edge.target:
            raise WorkflowValidationError("Node tidak boleh terhubung ke dirinya sendiri")

    # Deteksi siklus dengan Kahn.
    incoming = {node_id: 0 for node_id in nodes}
    for edge in definition.edges:
        incoming[edge.target] += 1
    queue = [node_id for node_id, count in incoming.items() if count == 0]
    visited = 0
    while queue:
        current = queue.pop()
        visited += 1
        for edge in definition.edges:
            if edge.source == current:
                incoming[edge.target] -= 1
                if incoming[edge.target] == 0:
                    queue.append(edge.target)
    if visited != len(nodes):
        raise WorkflowValidationError("Workflow tidak boleh berisi siklus")

    for node in definition.nodes:
        _validate_node(node, definition)


def _validate_node(node: WorkflowNode, definition: WorkflowDefinition) -> None:
    config = node.config
    outgoing = [edge for edge in definition.edges if edge.source == node.id]

    if node.type == "trigger.schedule":
        interval = config.get("interval_seconds", 300)
        if not isinstance(interval, int) or interval < 60:
            raise WorkflowValidationError(
                "Interval schedule minimal 60 detik"
            )
    elif node.type == "action.chat":
        model = config.get("model")
        if not isinstance(model, str) or not model.strip():
            raise WorkflowValidationError(f"Node '{node.id}' butuh model")
    elif node.type == "action.http":
        url = config.get("url")
        if not isinstance(url, str) or not url.strip():
            raise WorkflowValidationError(f"Node '{node.id}' butuh URL")
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise WorkflowValidationError(
                f"URL node '{node.id}' harus http atau https"
            )
        method = str(config.get("method", "POST")).upper()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
            raise WorkflowValidationError(f"Method node '{node.id}' tidak didukung")
    elif node.type == "logic.condition":
        if not isinstance(config.get("path"), str) or not config.get("path"):
            raise WorkflowValidationError(f"Node '{node.id}' butuh field path")
        if config.get("operator") not in CONDITION_OPERATORS:
            raise WorkflowValidationError(f"Operator node '{node.id}' tidak dikenal")
        for edge in outgoing:
            if edge.branch == "always":
                raise WorkflowValidationError(
                    f"Cabang keluaran node '{node.id}' harus true atau false"
                )
    elif node.type == "logic.set":
        fields = config.get("fields")
        if not isinstance(fields, dict) or not fields:
            raise WorkflowValidationError(f"Node '{node.id}' butuh minimal satu field")
    else:
        for edge in outgoing:
            if edge.branch != "always":
                raise WorkflowValidationError(
                    f"Node '{node.id}' tidak punya cabang true/false"
                )


def resolve_path(data: Any, path: str) -> Any:
    current = data
    for part in path.split("."):
        if not part:
            continue
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.lstrip("-").isdigit():
            index = int(part)
            current = current[index] if -len(current) <= index < len(current) else None
        else:
            return None
        if current is None:
            return None
    return current


def render(value: Any, context: dict[str, Any]) -> Any:
    if not isinstance(value, str):
        return value

    single = TEMPLATE.fullmatch(value.strip())
    if single:
        resolved = resolve_path(context, single.group(1))
        return resolved if resolved is not None else ""

    def replace(match: re.Match[str]) -> str:
        resolved = resolve_path(context, match.group(1))
        if resolved is None:
            return ""
        if isinstance(resolved, (dict, list)):
            return json.dumps(resolved, ensure_ascii=False)
        return str(resolved)

    return TEMPLATE.sub(replace, value)


def _host_forbidden(hostname: str) -> bool:
    try:
        addresses = {ipaddress.ip_address(hostname)}
    except ValueError:
        try:
            infos = socket.getaddrinfo(hostname, None)
        except OSError:
            return False
        addresses = {ipaddress.ip_address(info[4][0]) for info in infos}
    return any(
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
        for address in addresses
    )


def _http_node(node: WorkflowNode, incoming: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    config = node.config
    url = str(render(config.get("url", ""), context)).strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise WorkflowRunError("URL node HTTP tidak valid")
    if not settings.allow_private_provider_urls and _host_forbidden(parsed.hostname):
        raise WorkflowRunError("URL node HTTP menunjuk ke jaringan privat")

    method = str(config.get("method", "POST")).upper()
    raw_headers = config.get("headers") or {}
    if not isinstance(raw_headers, dict):
        raise WorkflowRunError("Header node HTTP harus objek JSON")
    headers = {
        str(key): str(render(value, context)) for key, value in raw_headers.items()
    }
    body_config = config.get("body")
    payload: Any = None
    if body_config not in (None, ""):
        rendered = render(body_config, context)
        if isinstance(rendered, (dict, list)):
            payload = rendered
        else:
            text = str(rendered)
            try:
                payload = json.loads(text)
            except ValueError:
                payload = text

    try:
        with httpx.Client(
            timeout=httpx.Timeout(20.0, connect=8.0),
            follow_redirects=False,
            trust_env=False,
        ) as client:
            if payload is None:
                response = client.request(method, url, headers=headers)
            elif isinstance(payload, (dict, list)):
                response = client.request(method, url, headers=headers, json=payload)
            else:
                response = client.request(
                    method,
                    url,
                    headers={**headers, "Content-Type": "text/plain; charset=utf-8"},
                    content=str(payload).encode("utf-8"),
                )
    except httpx.HTTPError as exc:
        raise WorkflowRunError(f"Permintaan HTTP gagal: {type(exc).__name__}") from exc

    raw = response.content[:MAX_HTTP_BYTES]
    try:
        body: Any = json.loads(raw.decode("utf-8", "replace"))
    except ValueError:
        body = raw.decode("utf-8", "replace")[:MAX_OUTPUT_TEXT]
    return {"status": response.status_code, "ok": response.is_success, "body": body}


def _chat_node(node: WorkflowNode, context: dict[str, Any]) -> dict[str, Any]:
    config = node.config
    model_name = str(config.get("model", "")).strip()
    system_prompt = config.get("system")
    prompt = render(config.get("prompt") or "{{data}}", context)
    if isinstance(prompt, (dict, list)):
        prompt = json.dumps(prompt, ensure_ascii=False)
    messages: list[dict[str, Any]] = []
    if system_prompt:
        system_text = render(system_prompt, context)
        messages.append({"role": "system", "content": str(system_text)})
    messages.append({"role": "user", "content": str(prompt)})

    internal_key = gateway_service.AuthenticatedKey(
        id=None,
        name="Workflow",
        allowed_models=(),
        budget_limit_usd=None,
        budget_period="monthly",
        rate_limit_rpm=None,
    )
    try:
        route = gateway_service.resolve_model(internal_key, model_name)
    except gateway_service.GatewayError as exc:
        raise WorkflowRunError(exc.message) from exc

    adapter = get_adapter(route.adapter_type)
    body: dict[str, Any] = {"model": route.provider_model, "messages": messages}
    temperature = config.get("temperature")
    if isinstance(temperature, (int, float)):
        body["temperature"] = max(0.0, min(2.0, float(temperature)))

    created_at = datetime.now(timezone.utc)
    started = time.perf_counter()
    request_id = f"wf_{uuid.uuid4().hex}"
    try:
        with httpx.Client(
            timeout=httpx.Timeout(
                settings.gateway_timeout_seconds,
                connect=settings.gateway_connect_timeout_seconds,
            ),
            follow_redirects=False,
            trust_env=False,
        ) as client:
            response = client.post(
                adapter.chat_completions_url(route.base_url),
                headers=adapter.headers(route.api_key, False),
                json=adapter.prepare_body(body),
            )
    except httpx.HTTPError as exc:
        _log_chat(
            request_id,
            route,
            0,
            0,
            502,
            int((time.perf_counter() - started) * 1000),
            "provider_connection_error",
            created_at,
        )
        raise WorkflowRunError(f"Provider tidak dapat dihubungi: {type(exc).__name__}") from exc

    duration_ms = int((time.perf_counter() - started) * 1000)
    if response.status_code >= 400:
        _log_chat(
            request_id,
            route,
            0,
            0,
            response.status_code,
            duration_ms,
            "provider_error",
            created_at,
        )
        raise WorkflowRunError(f"Provider membalas HTTP {response.status_code}")

    try:
        payload = response.json()
        text = str(payload["choices"][0]["message"]["content"])
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        _log_chat(
            request_id,
            route,
            0,
            0,
            502,
            duration_ms,
            "invalid_provider_response",
            created_at,
        )
        raise WorkflowRunError("Respons provider tidak sesuai format chat") from exc

    usage = payload.get("usage") or {}
    input_tokens = int(usage.get("prompt_tokens") or 0)
    output_tokens = int(usage.get("completion_tokens") or 0)
    _log_chat(
        request_id,
        route,
        input_tokens,
        output_tokens,
        200,
        duration_ms,
        None,
        created_at,
    )
    return {
        "text": text,
        "model": model_name,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }


def _log_chat(
    request_id: str,
    route: gateway_service.ModelRoute,
    input_tokens: int,
    output_tokens: int,
    status_code: int,
    duration_ms: int,
    error_code: str | None,
    created_at: datetime,
) -> None:
    cost_usd, cost_status = calculate_cost(
        route.provider_model, input_tokens, output_tokens
    )
    try:
        gateway_repository.create_request_log(
            request_id=request_id,
            virtual_key_id=None,
            provider_id=route.provider_id,
            public_model=route.public_name,
            provider_model=route.provider_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            cost_status=cost_status,
            status_code=status_code,
            duration_ms=duration_ms,
            streamed=False,
            error_code=error_code,
            created_at=created_at,
            finished_at=datetime.now(timezone.utc),
        )
    except Exception:
        pass


def _condition_node(node: WorkflowNode, incoming: Any) -> tuple[dict[str, Any], str]:
    config = node.config
    actual = resolve_path({"data": incoming}, str(config.get("path", "")))
    if actual is None:
        actual = resolve_path(incoming, str(config.get("path", "")))
    expected = config.get("value")
    operator = config.get("operator")

    if operator == "equals":
        result = actual == expected
    elif operator == "not_equals":
        result = actual != expected
    elif operator == "contains":
        result = expected is not None and str(expected) in str(actual or "")
    elif operator == "not_contains":
        result = expected is not None and str(expected) not in str(actual or "")
    elif operator == "gt":
        result = _as_number(actual) > _as_number(expected)
    elif operator == "lt":
        result = _as_number(actual) < _as_number(expected)
    elif operator == "is_empty":
        result = actual in (None, "", [], {})
    else:
        result = actual not in (None, "", [], {})

    return {"result": result, "actual": actual}, ("true" if result else "false")


def _as_number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _set_node(node: WorkflowNode, incoming: Any, context: dict[str, Any]) -> dict[str, Any]:
    base = dict(incoming) if isinstance(incoming, dict) else {"value": incoming}
    fields = node.config.get("fields") or {}
    for key, template in fields.items():
        base[str(key)] = render(template, {**context, "data": incoming})
    return base


def _topological_order(definition: WorkflowDefinition) -> list[str]:
    ids = [node.id for node in definition.nodes]
    incoming = {node_id: 0 for node_id in ids}
    for edge in definition.edges:
        incoming[edge.target] += 1
    queue = [node_id for node_id in ids if incoming[node_id] == 0]
    order: list[str] = []
    while queue:
        current = queue.pop(0)
        order.append(current)
        for edge in definition.edges:
            if edge.source == current:
                incoming[edge.target] -= 1
                if incoming[edge.target] == 0:
                    queue.append(edge.target)
    return order


def _execute(
    definition: WorkflowDefinition,
    run_id: int,
    input_data: dict[str, Any],
) -> dict[str, Any]:
    nodes = {node.id: node for node in definition.nodes}
    trigger = next(node for node in definition.nodes if node.type in TRIGGER_TYPES)
    active: dict[str, Any] = {trigger.id: {"input": input_data}}
    outputs: dict[str, Any] = {}
    last_output: Any = None

    for node_id in _topological_order(definition):
        node = nodes[node_id]
        if node_id not in active:
            workflow_repository.add_step(
                run_id, node_id, node.type, "skipped", None, None, 0
            )
            continue

        incoming = active[node_id]
        context = {"input": input_data, "nodes": outputs, "data": incoming}
        started = time.perf_counter()
        try:
            if node.type == "trigger.manual" or node.type == "trigger.webhook":
                output: Any = {"input": input_data}
                branch = "always"
            elif node.type == "trigger.schedule":
                output = {"input": input_data, "scheduled_at": input_data.get("scheduled_at")}
                branch = "always"
            elif node.type == "action.chat":
                output = _chat_node(node, context)
                branch = "always"
            elif node.type == "action.http":
                output = _http_node(node, incoming, context)
                branch = "always"
            elif node.type == "logic.condition":
                output, branch = _condition_node(node, incoming)
            elif node.type == "logic.set":
                output = _set_node(node, incoming, context)
                branch = "always"
            else:
                raise WorkflowRunError(f"Tipe node tidak didukung: {node.type}")
        except WorkflowRunError as exc:
            duration = int((time.perf_counter() - started) * 1000)
            workflow_repository.add_step(
                run_id, node_id, node.type, "error", None, exc.message, duration
            )
            raise
        except Exception as exc:
            duration = int((time.perf_counter() - started) * 1000)
            message = f"{type(exc).__name__}: {_clean(str(exc))}"
            workflow_repository.add_step(
                run_id, node_id, node.type, "error", None, message, duration
            )
            raise WorkflowRunError(message) from exc

        duration = int((time.perf_counter() - started) * 1000)
        workflow_repository.add_step(
            run_id, node_id, node.type, "success", output, None, duration
        )
        outputs[node_id] = output
        last_output = output

        for edge in definition.edges:
            if edge.source != node_id:
                continue
            if node.type == "logic.condition" and edge.branch != branch:
                continue
            if node.type != "logic.condition" and edge.branch != "always":
                continue
            active[edge.target] = output

    return {"last": last_output, "nodes": outputs}


def run_workflow(
    workflow: Any,
    trigger: str,
    input_data: dict[str, Any],
) -> int:
    raw = workflow["definition"]
    definition = WorkflowDefinition.model_validate(
        json.loads(raw) if isinstance(raw, str) else raw
    )
    validate_definition(definition)
    workflow_id = int(workflow["id"])

    run_id = workflow_repository.create_run(workflow_id, trigger, input_data)
    try:
        result = _execute(definition, run_id, input_data)
        workflow_repository.finish_run(run_id, "success", result)
    except WorkflowRunError as exc:
        workflow_repository.finish_run(run_id, "error", None, exc.message)
    except Exception as exc:
        workflow_repository.finish_run(
            run_id, "error", None, f"{type(exc).__name__}: {_clean(str(exc))}"
        )
    return run_id


def schedule_interval(definition: dict[str, Any]) -> int | None:
    for node in definition.get("nodes", []):
        if node.get("type") == "trigger.schedule":
            interval = node.get("config", {}).get("interval_seconds", 300)
            if isinstance(interval, int) and interval >= 60:
                return interval
    return None
