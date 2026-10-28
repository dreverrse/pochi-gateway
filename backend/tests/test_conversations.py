import asyncio
import threading
import time
import uuid

import pytest

from app.core.config import settings
from app.db.database import get_connection
from app.services import gateway as gateway_service

PROVIDER_MODEL = "upstream-conversation-model"
PROVIDER_SECRET = "sk-conversation-provider"


@pytest.fixture(scope="module")
def chat_model(client, auth_headers):
    response = client.post(
        "/api/v1/admin/providers",
        json={
            "name": f"Conversation Provider {uuid.uuid4().hex[:8]}",
            "base_url": "https://conversation-upstream.invalid/v1",
            "adapter_type": "openai_compatible",
            "api_key": PROVIDER_SECRET,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    provider = response.json()

    public_name = f"conversation-model-{uuid.uuid4().hex[:6]}"
    response = client.post(
        "/api/v1/admin/models",
        json={
            "public_name": public_name,
            "provider_id": provider["id"],
            "provider_model": PROVIDER_MODEL,
            "input_usd_per_million": 2.0,
            "output_usd_per_million": 8.0,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return public_name


class FakeResponse:
    def __init__(self, status_code=200, content=b"", headers=None, chunks=None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}
        self._chunks = chunks or []

    async def aread(self):
        return self.content

    async def aclose(self):
        return None

    async def aiter_bytes(self):
        for chunk in self._chunks:
            yield chunk


def _install_fake_upstream(monkeypatch, responder):
    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def build_request(self, method, url, json=None, headers=None):
            return {"method": method, "url": url, "json": json, "headers": headers}

        async def send(self, request, stream=False):
            return responder(request, stream)

        async def aclose(self):
            return None

    monkeypatch.setattr(gateway_service.httpx, "AsyncClient", FakeClient)


def _create(client, auth_headers, model, **overrides):
    payload = {"model": model, "title": None, **overrides}
    response = client.post("/api/v1/admin/conversations", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_conversations_require_admin(client):
    assert client.get("/api/v1/admin/conversations").status_code == 401
    assert (
        client.post(
            "/api/v1/admin/conversations",
            json={"model": "pochi-chat"},
        ).status_code
        == 401
    )


def test_conversation_crud(client, auth_headers):
    created = _create(client, auth_headers, "pochi-chat")
    conversation_id = created["id"]
    assert created["title"] == "Percakapan baru"
    assert created["messages"] == []
    assert created["model"] == "pochi-chat"

    listing = client.get("/api/v1/admin/conversations", headers=auth_headers)
    assert listing.status_code == 200
    assert any(item["id"] == conversation_id for item in listing.json())

    renamed = client.patch(
        f"/api/v1/admin/conversations/{conversation_id}",
        json={"title": "Riset gateway"},
        headers=auth_headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Riset gateway"

    detail = client.get(
        f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers
    )
    assert detail.status_code == 200
    assert detail.json()["title"] == "Riset gateway"

    removed = client.delete(
        f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers
    )
    assert removed.status_code == 204
    assert (
        client.get(
            f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers
        ).status_code
        == 404
    )


def test_conversation_rename_validates_title(client, auth_headers):
    created = _create(client, auth_headers, "pochi-chat")
    response = client.patch(
        f"/api/v1/admin/conversations/{created['id']}",
        json={"title": ""},
        headers=auth_headers,
    )
    assert response.status_code == 422
    client.delete(f"/api/v1/admin/conversations/{created['id']}", headers=auth_headers)


def test_chat_with_conversation_persists_messages_and_usage(
    client, auth_headers, monkeypatch, chat_model
):
    chunks = [
        b'data: {"choices":[{"delta":{"content":"Halo "}}]}\n\n',
        b'data: {"choices":[{"delta":{"content":"dj"}}]}\n\n',
        b'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":5}}\n\n',
        b"data: [DONE]\n\n",
    ]
    _install_fake_upstream(
        monkeypatch,
        lambda request, stream: FakeResponse(
            status_code=200,
            headers={"content-type": "text/event-stream"},
            chunks=chunks,
        ),
    )

    created = _create(client, auth_headers, chat_model)
    conversation_id = created["id"]

    response = client.post(
        "/api/v1/admin/chat",
        json={
            "model": chat_model,
            "messages": [{"role": "user", "content": "Halo Pochi"}],
            "conversation_id": conversation_id,
            "user_message": "Halo Pochi",
            "stream": True,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert "Halo" in response.text

    detail = client.get(
        f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers
    ).json()

    assert detail["title"] == "Halo Pochi"
    roles = [message["role"] for message in detail["messages"]]
    assert roles == ["user", "assistant"]

    assistant = detail["messages"][1]
    assert assistant["content"] == "Halo dj"
    assert assistant["status"] == "complete"
    assert assistant["input_tokens"] == 11
    assert assistant["output_tokens"] == 5
    assert assistant["total_tokens"] == 16
    assert assistant["cost_status"] == "known"
    assert assistant["cost_usd"] == pytest.approx((11 * 2.0 + 5 * 8.0) / 1_000_000)
    assert assistant["provider_name"]

    with get_connection(settings.db_path) as connection:
        log = connection.execute(
            "SELECT * FROM request_logs WHERE public_model = ? ORDER BY id DESC LIMIT 1",
            (chat_model,),
        ).fetchone()
    assert log is not None
    assert log["input_tokens"] == 11
    assert log["output_tokens"] == 5
    assert log["virtual_key_id"] is None

    client.delete(f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers)


def test_chat_with_unknown_conversation_returns_404(client, auth_headers):
    response = client.post(
        "/api/v1/admin/chat",
        json={
            "model": "pochi-chat",
            "messages": [{"role": "user", "content": "hai"}],
            "conversation_id": 999_999,
        },
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_chat_conversation_requires_user_message_limit(client, auth_headers):
    created = _create(client, auth_headers, "pochi-chat")
    response = client.post(
        "/api/v1/admin/chat",
        json={
            "model": "pochi-chat",
            "messages": [{"role": "user", "content": "hai"}],
            "conversation_id": created["id"],
            "user_message": "x" * 200_001,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422
    client.delete(f"/api/v1/admin/conversations/{created['id']}", headers=auth_headers)


def test_clear_conversation_keeps_conversation(
    client, auth_headers, monkeypatch, chat_model
):
    _install_fake_upstream(
        monkeypatch,
        lambda request, stream: FakeResponse(
            status_code=200,
            headers={"content-type": "text/event-stream"},
            chunks=[
                b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
                b"data: [DONE]\n\n",
            ],
        ),
    )
    created = _create(client, auth_headers, chat_model, title="Percakapan uji")
    conversation_id = created["id"]

    client.post(
        "/api/v1/admin/chat",
        json={
            "model": chat_model,
            "messages": [{"role": "user", "content": "tes"}],
            "conversation_id": conversation_id,
            "user_message": "tes",
        },
        headers=auth_headers,
    )

    cleared = client.post(
        f"/api/v1/admin/conversations/{conversation_id}/clear", headers=auth_headers
    )
    assert cleared.status_code == 200
    assert cleared.json()["messages"] == []
    assert cleared.json()["title"] == "Percakapan uji"

    client.delete(f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers)


def test_conversation_search_filters_by_title(client, auth_headers):
    unique = f"judul-{uuid.uuid4().hex[:6]}"
    created = _create(client, auth_headers, "pochi-chat", title=unique)

    found = client.get(
        "/api/v1/admin/conversations", params={"search": unique}, headers=auth_headers
    ).json()
    assert [item["id"] for item in found] == [created["id"]]

    empty = client.get(
        "/api/v1/admin/conversations",
        params={"search": "tidak-ada-yang-cocok"},
        headers=auth_headers,
    ).json()
    assert empty == []

    client.delete(f"/api/v1/admin/conversations/{created['id']}", headers=auth_headers)


def test_stop_endpoint_ends_running_stream_early(client, auth_headers, monkeypatch, chat_model):
    """Tombol Stop: POST /stop harus membuat stream berhenti dan pesan asisten
    tersimpan dengan status stopped, bukan menunggu provider selesai."""

    class SlowResponse(FakeResponse):
        async def aiter_bytes(self):
            for _ in range(80):
                await asyncio.sleep(0.02)
                yield b'data: {"choices":[{"delta":{"content":"kata "}}]}\n\n'

    _install_fake_upstream(
        monkeypatch,
        lambda request, stream: SlowResponse(
            status_code=200, headers={"content-type": "text/event-stream"}
        ),
    )

    created = _create(client, auth_headers, chat_model)
    conversation_id = created["id"]
    result = {}

    def run_chat():
        response = client.post(
            "/api/v1/admin/chat",
            json={
                "model": chat_model,
                "messages": [{"role": "user", "content": "stream panjang"}],
                "conversation_id": conversation_id,
                "user_message": "stream panjang",
                "stream": True,
            },
            headers=auth_headers,
        )
        result["status"] = response.status_code
        result["body"] = response.text

    thread = threading.Thread(target=run_chat)
    thread.start()
    time.sleep(0.3)

    stopped = client.post(
        f"/api/v1/admin/conversations/{conversation_id}/stop", headers=auth_headers
    )
    assert stopped.status_code == 202
    assert stopped.json()["stopped"] is True

    thread.join(timeout=15)
    assert not thread.is_alive(), "stream tidak berhenti setelah /stop"
    assert result["status"] == 200

    detail = client.get(
        f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers
    ).json()
    assistant = detail["messages"][-1]
    assert assistant["role"] == "assistant"
    assert assistant["status"] == "stopped"
    assert 0 < len(assistant["content"]) < 80 * len("kata ")

    # Percakapan yang tidak sedang streaming: stop idempoten, bukan error.
    again = client.post(
        f"/api/v1/admin/conversations/{conversation_id}/stop", headers=auth_headers
    )
    assert again.json()["stopped"] is False

    client.delete(f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers)


def test_stop_before_provider_responds_returns_499(client, auth_headers, monkeypatch, chat_model):
    """Stop saat provider belum mengirim byte pertama: permintaan tidak boleh
    menggantung sampai timeout, dan pesan asisten tetap dicatat sebagai stopped."""

    class SlowSendClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def build_request(self, method, url, json=None, headers=None):
            return {"method": method, "url": url, "json": json, "headers": headers}

        async def send(self, request, stream=False):
            await asyncio.sleep(30)
            return FakeResponse(status_code=200)

        async def aclose(self):
            return None

    monkeypatch.setattr(gateway_service.httpx, "AsyncClient", SlowSendClient)

    created = _create(client, auth_headers, chat_model)
    conversation_id = created["id"]
    result = {}

    def run_chat():
        response = client.post(
            "/api/v1/admin/chat",
            json={
                "model": chat_model,
                "messages": [{"role": "user", "content": "lambat"}],
                "conversation_id": conversation_id,
                "user_message": "lambat",
            },
            headers=auth_headers,
        )
        result["status"] = response.status_code

    thread = threading.Thread(target=run_chat)
    thread.start()
    time.sleep(0.4)
    stopped = client.post(
        f"/api/v1/admin/conversations/{conversation_id}/stop", headers=auth_headers
    )
    assert stopped.json()["stopped"] is True

    thread.join(timeout=10)
    assert not thread.is_alive(), "permintaan masih menggantung setelah Stop"
    assert result["status"] == 499

    detail = client.get(
        f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers
    ).json()
    assistant = detail["messages"][-1]
    assert assistant["role"] == "assistant"
    assert assistant["status"] == "stopped"

    client.delete(f"/api/v1/admin/conversations/{conversation_id}", headers=auth_headers)
