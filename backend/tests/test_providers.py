import uuid

from app.core.config import settings
from app.core.security import SecretBox
from app.db.database import get_connection
from app.services import providers as provider_service

PROVIDERS_PATH = "/api/v1/admin/providers"


def _unique_name() -> str:
    return f"Test Provider {uuid.uuid4().hex[:8]}"


def _payload(name: str, api_key: str | None = "sk-provider-test") -> dict:
    payload = {
        "name": name,
        "base_url": "https://api.test.invalid/v1",
        "adapter_type": "openai_compatible",
        "enabled": True,
    }
    if api_key is not None:
        payload["api_key"] = api_key
    return payload


def _create(client, auth_headers, name: str | None = None, api_key: str | None = "sk-provider-test"):
    response = client.post(
        PROVIDERS_PATH,
        json=_payload(name or _unique_name(), api_key),
        headers=auth_headers,
    )
    assert response.status_code == 201
    return response.json()


def _secret_row(provider_id: int):
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            "SELECT ciphertext, key_version FROM provider_secrets WHERE provider_id = ?",
            (provider_id,),
        ).fetchone()


def test_list_providers_hides_secrets(client, auth_headers):
    response = client.get(PROVIDERS_PATH, headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    for provider in body:
        assert "ciphertext" not in provider
        assert "api_key" not in provider
        assert isinstance(provider["has_secret"], bool)


def test_create_provider_encrypts_secret(client, auth_headers):
    name = _unique_name()
    body = _create(client, auth_headers, name=name, api_key="sk-first-secret")

    assert body["name"] == name
    assert body["has_secret"] is True
    assert "api_key" not in body
    assert "ciphertext" not in body

    row = _secret_row(body["id"])
    assert row is not None
    assert row["key_version"] == 1
    assert "sk-first-secret" not in row["ciphertext"]
    assert SecretBox(settings.secret_key_path).decrypt(row["ciphertext"]) == "sk-first-secret"


def test_duplicate_provider_name_is_rejected(client, auth_headers):
    name = _unique_name()
    _create(client, auth_headers, name=name)

    response = client.post(PROVIDERS_PATH, json=_payload(name), headers=auth_headers)

    assert response.status_code == 409


def test_update_provider_keeps_and_rotates_secret(client, auth_headers):
    created = _create(client, auth_headers, api_key="sk-first-secret")
    first_row = _secret_row(created["id"])

    response = client.patch(
        f"{PROVIDERS_PATH}/{created['id']}",
        json={"enabled": False},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert response.json()["has_secret"] is True
    assert _secret_row(created["id"])["ciphertext"] == first_row["ciphertext"]

    response = client.patch(
        f"{PROVIDERS_PATH}/{created['id']}",
        json={"api_key": "sk-second-secret"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    second_row = _secret_row(created["id"])
    assert second_row["ciphertext"] != first_row["ciphertext"]
    assert SecretBox(settings.secret_key_path).decrypt(second_row["ciphertext"]) == "sk-second-secret"


def test_provider_url_validation(client, auth_headers):
    for base_url in (
        "file:///etc/passwd",
        "https://user:password@example.com/v1",
        "https://example.com/v1?target=internal",
    ):
        response = client.post(
            PROVIDERS_PATH,
            json={
                "name": _unique_name(),
                "base_url": base_url,
                "adapter_type": "openai_compatible",
            },
            headers=auth_headers,
        )
        assert response.status_code == 422, base_url


def test_connection_test_without_secret(client, auth_headers):
    providers = client.get(PROVIDERS_PATH, headers=auth_headers).json()
    demo = next(provider for provider in providers if not provider["has_secret"])

    response = client.post(f"{PROVIDERS_PATH}/{demo['id']}/test", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["ok"] is False
    assert "belum disimpan" in response.json()["message"]


def test_connection_test_success(client, auth_headers, monkeypatch):
    created = _create(client, auth_headers, api_key="sk-connection-test")
    calls = []

    class FakeResponse:
        status_code = 200
        reason_phrase = "OK"

        def json(self):
            return {"data": [{"id": "model-a"}, {"id": "model-b"}]}

    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers=None):
            calls.append((url, headers))
            return FakeResponse()

    class FakeHttpx:
        Client = FakeClient
        HTTPError = provider_service.httpx.HTTPError
        TimeoutException = provider_service.httpx.TimeoutException

    monkeypatch.setattr(provider_service, "httpx", FakeHttpx)

    response = client.post(f"{PROVIDERS_PATH}/{created['id']}/test", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["models_count"] == 2
    assert body["status_code"] == 200
    assert calls[0][0] == "https://api.test.invalid/v1/models"
    assert calls[0][1]["Authorization"] == "Bearer sk-connection-test"


def test_connection_test_reports_provider_error(client, auth_headers, monkeypatch):
    created = _create(client, auth_headers, api_key="sk-rejected-test")

    class FakeResponse:
        status_code = 401
        reason_phrase = "Unauthorized"

        def json(self):
            return {"error": {"message": "invalid api key"}}

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers=None):
            return FakeResponse()

    class FakeHttpx:
        Client = FakeClient
        HTTPError = provider_service.httpx.HTTPError
        TimeoutException = provider_service.httpx.TimeoutException

    monkeypatch.setattr(provider_service, "httpx", FakeHttpx)

    response = client.post(f"{PROVIDERS_PATH}/{created['id']}/test", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert body["status_code"] == 401
    assert "invalid api key" in body["message"]
    assert "sk-rejected-test" not in body["message"]
