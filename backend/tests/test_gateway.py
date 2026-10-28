import json
import uuid

import pytest

from app.core.config import settings
from app.db.database import get_connection
from app.services import gateway as gateway_service

TEST_MODEL = "gateway-test-model"
PROVIDER_MODEL = "upstream-test-model"
PROVIDER_SECRET = "sk-gateway-provider"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_key(client, auth_headers, allowed_models):
    response = client.post(
        "/api/v1/admin/keys",
        json={
            "name": f"Gateway Key {uuid.uuid4().hex[:8]}",
            "allowed_models": allowed_models,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture(scope="module")
def gateway_account(client, auth_headers):
    provider_name = f"Gateway Provider {uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/v1/admin/providers",
        json={
            "name": provider_name,
            "base_url": "https://gateway-upstream.invalid/v1",
            "adapter_type": "openai_compatible",
            "api_key": PROVIDER_SECRET,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    provider = response.json()

    response = client.post(
        "/api/v1/admin/models",
        json={
            "public_name": TEST_MODEL,
            "provider_id": provider["id"],
            "provider_model": PROVIDER_MODEL,
            "input_usd_per_million": 2.0,
            "output_usd_per_million": 8.0,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    model = response.json()

    created = _create_key(client, auth_headers, [TEST_MODEL])
    return {
        "provider": provider,
        "model": model,
        "key": created["key"],
        "token": created["token"],
    }


class FakeResponse:
    def __init__(self, status_code=200, content=b"", headers=None, chunks=None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}
        self._chunks = chunks or []
        self.closed = False

    async def aread(self):
        return self.content

    async def aclose(self):
        self.closed = True

    async def aiter_bytes(self):
        for chunk in self._chunks:
            yield chunk


def _install_fake_upstream(monkeypatch, responder):
    calls = []

    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def build_request(self, method, url, json=None, headers=None):
            request = {
                "method": method,
                "url": url,
                "json": json,
                "headers": headers,
            }
            calls.append(request)
            return request

        async def send(self, request, stream=False):
            return responder(request, stream)

        async def aclose(self):
            calls.append({"closed": True})

    monkeypatch.setattr(gateway_service.httpx, "AsyncClient", FakeClient)
    return calls


def _request_call(calls):
    return next(call for call in calls if "url" in call)


def _log_for(request_id):
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            "SELECT * FROM request_logs WHERE request_id = ?",
            (request_id,),
        ).fetchone()


def test_gateway_requires_valid_key(client):
    for headers in ({}, _auth("pk_pochi_tidak_ada")):
        response = client.get("/v1/models", headers=headers)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_api_key"
        assert response.headers["www-authenticate"] == "Bearer"


def test_models_endpoint_filters_allowed_models(client):
    response = client.get("/v1/models", headers=_auth("pochi-demo-key-android"))

    assert response.status_code == 200
    body = response.json()
    assert body["object"] == "list"
    ids = {model["id"] for model in body["data"]}
    assert {"pochi-chat", "pochi-fast"} <= ids
    assert "pochi-reason" not in ids
    for model in body["data"]:
        assert model["object"] == "model"
        assert isinstance(model["created"], int)
        assert model["owned_by"]


def test_models_endpoint_uses_created_key_allowlist(client, gateway_account):
    response = client.get("/v1/models", headers=_auth(gateway_account["token"]))

    assert response.status_code == 200
    assert [model["id"] for model in response.json()["data"]] == [TEST_MODEL]


def test_revoked_and_disabled_keys_are_rejected(client, auth_headers):
    created = _create_key(client, auth_headers, [])
    token = created["token"]
    key_id = created["key"]["id"]

    response = client.patch(
        f"/api/v1/admin/keys/{key_id}",
        json={"enabled": False},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert client.get("/v1/models", headers=_auth(token)).status_code == 401

    response = client.patch(
        f"/api/v1/admin/keys/{key_id}",
        json={"enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200

    response = client.post(f"/api/v1/admin/keys/{key_id}/revoke", headers=auth_headers)
    assert response.status_code == 200
    assert client.get("/v1/models", headers=_auth(token)).status_code == 401


def test_unknown_and_disallowed_models(client):
    response = client.post(
        "/v1/chat/completions",
        json={"model": "model-tidak-ada", "messages": [{"role": "user", "content": "Hi"}]},
        headers=_auth("pochi-demo-key-android"),
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "model_not_found"

    response = client.post(
        "/v1/chat/completions",
        json={"model": "pochi-reason", "messages": [{"role": "user", "content": "Hi"}]},
        headers=_auth("pochi-demo-key-android"),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "model_not_allowed"


def test_model_without_provider_secret_is_unavailable(client):
    response = client.post(
        "/v1/chat/completions",
        json={"model": "pochi-chat", "messages": [{"role": "user", "content": "Hi"}]},
        headers=_auth("pochi-demo-key-android"),
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "provider_unavailable"


def test_chat_completion_is_proxied_and_logged(client, gateway_account, monkeypatch):
    upstream_body = json.dumps(
        {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": "Hello!"}}
            ],
            "usage": {"prompt_tokens": 21, "completion_tokens": 9, "total_tokens": 30},
        }
    ).encode("utf-8")

    response_obj = FakeResponse(
        status_code=200,
        content=upstream_body,
        headers={"content-type": "application/json"},
    )
    calls = _install_fake_upstream(monkeypatch, lambda request, stream: response_obj)

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": TEST_MODEL,
            "messages": [{"role": "user", "content": "Halo"}],
            "temperature": 0.2,
        },
        headers=_auth(gateway_account["token"]),
    )

    assert response.status_code == 200
    assert response.json()["id"] == "chatcmpl-test"
    request_id = response.headers["x-pochi-request-id"]

    upstream = _request_call(calls)
    assert upstream["method"] == "POST"
    assert upstream["url"] == "https://gateway-upstream.invalid/v1/chat/completions"
    assert upstream["json"]["model"] == PROVIDER_MODEL
    assert upstream["json"]["messages"] == [{"role": "user", "content": "Halo"}]
    assert upstream["json"]["temperature"] == 0.2
    assert upstream["headers"]["Authorization"] == f"Bearer {PROVIDER_SECRET}"
    assert upstream["headers"]["Accept"] == "application/json"

    log = _log_for(request_id)
    assert log["virtual_key_id"] == gateway_account["key"]["id"]
    assert log["provider_id"] == gateway_account["provider"]["id"]
    assert log["public_model"] == TEST_MODEL
    assert log["provider_model"] == PROVIDER_MODEL
    assert log["input_tokens"] == 21
    assert log["output_tokens"] == 9
    assert log["status_code"] == 200
    assert log["streamed"] == 0
    assert log["cost_usd"] == pytest.approx(0.000114)
    assert log["cost_status"] == "known"
    assert log["error_code"] is None
    assert log["finished_at"] is not None

    with get_connection(settings.db_path) as connection:
        last_used = connection.execute(
            "SELECT last_used_at FROM virtual_keys WHERE id = ?",
            (gateway_account["key"]["id"],),
        ).fetchone()["last_used_at"]
    assert last_used is not None


def test_streaming_chat_completion_logs_usage(client, gateway_account, monkeypatch):
    chunks = [
        b'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        b'data: {"choices":[],"usage":{"prompt_tokens":7,',
        b'"completion_tokens":3}}\n\n',
        b"data: [DONE]\n\n",
    ]
    response_obj = FakeResponse(
        status_code=200,
        headers={"content-type": "text/event-stream"},
        chunks=chunks,
    )
    calls = _install_fake_upstream(monkeypatch, lambda request, stream: response_obj)

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": TEST_MODEL,
            "messages": [{"role": "user", "content": "Halo"}],
            "stream": True,
        },
        headers=_auth(gateway_account["token"]),
    )

    assert response.status_code == 200
    assert "Hi" in response.text
    assert "[DONE]" in response.text
    request_id = response.headers["x-pochi-request-id"]

    upstream = _request_call(calls)
    assert upstream["headers"]["Accept"] == "text/event-stream"
    assert upstream["json"]["stream"] is True

    log = _log_for(request_id)
    assert log["input_tokens"] == 7
    assert log["output_tokens"] == 3
    assert log["streamed"] == 1
    assert log["status_code"] == 200
    assert log["cost_usd"] == pytest.approx(0.000038)
    assert log["cost_status"] == "known"
    assert log["error_code"] is None


def test_model_without_price_logs_unknown_cost(client, auth_headers, monkeypatch):
    suffix = uuid.uuid4().hex[:8]
    model_name = f"gateway-unpriced-{suffix}"
    response = client.post(
        "/api/v1/admin/providers",
        json={
            "name": f"Unpriced Provider {suffix}",
            "base_url": "https://unpriced-upstream.invalid/v1",
            "adapter_type": "openai_compatible",
            "api_key": PROVIDER_SECRET,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    provider = response.json()

    response = client.post(
        "/api/v1/admin/models",
        json={
            "public_name": model_name,
            "provider_id": provider["id"],
            "provider_model": f"unpriced-upstream-{suffix}",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text

    key = _create_key(client, auth_headers, [model_name])
    response_obj = FakeResponse(
        status_code=200,
        content=json.dumps(
            {
                "id": "chatcmpl-unpriced",
                "object": "chat.completion",
                "choices": [],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            }
        ).encode("utf-8"),
        headers={"content-type": "application/json"},
    )
    _install_fake_upstream(monkeypatch, lambda request, stream: response_obj)

    response = client.post(
        "/v1/chat/completions",
        json={"model": model_name, "messages": [{"role": "user", "content": "Halo"}]},
        headers=_auth(key["token"]),
    )

    assert response.status_code == 200
    log = _log_for(response.headers["x-pochi-request-id"])
    assert log["input_tokens"] == 10
    assert log["output_tokens"] == 5
    assert log["cost_usd"] is None
    assert log["cost_status"] == "unknown"


def test_upstream_error_is_forwarded_and_logged(client, gateway_account, monkeypatch):
    upstream_body = json.dumps(
        {"error": {"message": "rate limited", "code": "rate_limit_exceeded"}}
    ).encode("utf-8")
    response_obj = FakeResponse(
        status_code=429,
        content=upstream_body,
        headers={"content-type": "application/json"},
    )
    _install_fake_upstream(monkeypatch, lambda request, stream: response_obj)

    response = client.post(
        "/v1/chat/completions",
        json={"model": TEST_MODEL, "messages": [{"role": "user", "content": "Halo"}]},
        headers=_auth(gateway_account["token"]),
    )

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limit_exceeded"
    log = _log_for(response.headers["x-pochi-request-id"])
    assert log["status_code"] == 429
    assert log["error_code"] == "rate_limit_exceeded"
    assert log["input_tokens"] == 0
    assert log["output_tokens"] == 0
    assert log["cost_usd"] == 0.0
    assert log["cost_status"] == "known"


def test_upstream_timeout_returns_gateway_error(client, gateway_account, monkeypatch):
    def raise_timeout(request, stream):
        raise gateway_service.httpx.TimeoutException("timed out")

    _install_fake_upstream(monkeypatch, raise_timeout)

    response = client.post(
        "/v1/chat/completions",
        json={"model": TEST_MODEL, "messages": [{"role": "user", "content": "Halo"}]},
        headers=_auth(gateway_account["token"]),
    )

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "gateway_timeout"
    log = _log_for(response.headers["x-pochi-request-id"])
    assert log["status_code"] == 504
    assert log["error_code"] == "gateway_timeout"


def test_gateway_validation_uses_openai_error_shape(client):
    response = client.post(
        "/v1/chat/completions",
        json={"model": "pochi-chat"},
        headers=_auth("pochi-demo-key-android"),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_budget_limit_blocks_further_requests(client, auth_headers, gateway_account, monkeypatch):
    key = _create_key(client, auth_headers, [TEST_MODEL])
    response_obj = FakeResponse(
        status_code=200,
        content=json.dumps(
            {
                "id": "chatcmpl-budget",
                "object": "chat.completion",
                "choices": [],
                "usage": {"prompt_tokens": 10, "completion_tokens": 10},
            }
        ).encode("utf-8"),
        headers={"content-type": "application/json"},
    )
    _install_fake_upstream(monkeypatch, lambda request, stream: response_obj)

    first = client.post(
        "/v1/chat/completions",
        json={"model": TEST_MODEL, "messages": [{"role": "user", "content": "Halo"}]},
        headers=_auth(key["token"]),
    )
    assert first.status_code == 200, first.text

    response = client.patch(
        f"/api/v1/admin/keys/{key['key']['id']}",
        json={"budget_limit_usd": 0.00001, "budget_period": "daily"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text

    blocked = client.post(
        "/v1/chat/completions",
        json={"model": TEST_MODEL, "messages": [{"role": "user", "content": "Halo"}]},
        headers=_auth(key["token"]),
    )
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "budget_exceeded"


def test_rate_limit_is_enforced_per_key(client, auth_headers, gateway_account, monkeypatch):
    key = _create_key(client, auth_headers, [TEST_MODEL])
    monkeypatch.setattr(gateway_service.settings, "gateway_rate_limit_rpm", 2)
    response_obj = FakeResponse(
        status_code=200,
        content=json.dumps(
            {
                "id": "chatcmpl-rate",
                "object": "chat.completion",
                "choices": [],
                "usage": {"prompt_tokens": 4, "completion_tokens": 2},
            }
        ).encode("utf-8"),
        headers={"content-type": "application/json"},
    )
    _install_fake_upstream(monkeypatch, lambda request, stream: response_obj)
    payload = {"model": TEST_MODEL, "messages": [{"role": "user", "content": "Halo"}]}

    assert client.post("/v1/chat/completions", json=payload, headers=_auth(key["token"])).status_code == 200
    assert client.post("/v1/chat/completions", json=payload, headers=_auth(key["token"])).status_code == 200

    blocked = client.post("/v1/chat/completions", json=payload, headers=_auth(key["token"]))
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limit_exceeded"
    assert int(blocked.headers["retry-after"]) >= 1
