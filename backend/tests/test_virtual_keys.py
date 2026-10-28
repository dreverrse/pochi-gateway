import hashlib
import uuid

from app.core.config import settings
from app.db.database import get_connection

KEYS_PATH = "/api/v1/admin/keys"


def _unique_name() -> str:
    return f"Test Key {uuid.uuid4().hex[:8]}"


def _key_row(key_id: int):
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            "SELECT key_hash, key_prefix, key_hash IS NOT NULL AS has_hash FROM virtual_keys WHERE id = ?",
            (key_id,),
        ).fetchone()


def _create(client, auth_headers, **overrides):
    payload = {
        "name": _unique_name(),
        "allowed_models": ["pochi-chat"],
        "budget_limit_usd": 12.5,
        "budget_period": "monthly",
        "enabled": True,
    }
    payload.update(overrides)
    response = client.post(KEYS_PATH, json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_list_keys_hides_hashes(client, auth_headers):
    response = client.get(KEYS_PATH, headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    for key in body:
        assert "key_hash" not in key
        assert "token" not in key
        assert isinstance(key["allowed_models"], list)


def test_create_key_returns_token_once(client, auth_headers):
    body = _create(client, auth_headers)
    key = body["key"]
    token = body["token"]

    assert token.startswith("pk_pochi_")
    assert key["key_prefix"] == token[:20]
    assert token.startswith(key["key_prefix"])
    assert key["allowed_models"] == ["pochi-chat"]
    assert key["budget_limit_usd"] == 12.5
    assert key["revoked_at"] is None

    row = _key_row(key["id"])
    assert row["has_hash"] == 1
    assert row["key_hash"] == hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert token not in row["key_hash"]

    public_list = client.get(KEYS_PATH, headers=auth_headers).json()
    listed = next(item for item in public_list if item["id"] == key["id"])
    assert "token" not in listed
    assert "key_hash" not in listed


def test_create_key_validates_models(client, auth_headers):
    response = client.post(
        KEYS_PATH,
        json={"name": _unique_name(), "allowed_models": ["model-tidak-ada"]},
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_update_key_keeps_hash_and_allows_clearing_budget(client, auth_headers):
    body = _create(client, auth_headers)
    key_id = body["key"]["id"]
    original_hash = _key_row(key_id)["key_hash"]

    response = client.patch(
        f"{KEYS_PATH}/{key_id}",
        json={
            "name": "Key Diubah",
            "allowed_models": ["pochi-fast", "pochi-reason"],
            "budget_limit_usd": 3.25,
            "budget_period": "daily",
            "enabled": False,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Key Diubah"
    assert updated["allowed_models"] == ["pochi-fast", "pochi-reason"]
    assert updated["budget_limit_usd"] == 3.25
    assert updated["budget_period"] == "daily"
    assert updated["enabled"] is False
    assert _key_row(key_id)["key_hash"] == original_hash

    response = client.patch(
        f"{KEYS_PATH}/{key_id}",
        json={"budget_limit_usd": None},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["budget_limit_usd"] is None


def test_revoke_key_is_permanent(client, auth_headers):
    body = _create(client, auth_headers)
    key_id = body["key"]["id"]
    original_hash = _key_row(key_id)["key_hash"]

    response = client.post(f"{KEYS_PATH}/{key_id}/revoke", headers=auth_headers)

    assert response.status_code == 200
    revoked = response.json()
    assert revoked["enabled"] is False
    assert revoked["revoked_at"] is not None
    assert _key_row(key_id)["key_hash"] == original_hash

    again = client.post(f"{KEYS_PATH}/{key_id}/revoke", headers=auth_headers)
    assert again.status_code == 200
    assert again.json()["revoked_at"] == revoked["revoked_at"]

    response = client.patch(
        f"{KEYS_PATH}/{key_id}",
        json={"enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 409


def test_unknown_key_returns_404(client, auth_headers):
    response = client.patch(f"{KEYS_PATH}/999999", json={"name": "X"}, headers=auth_headers)
    assert response.status_code == 404

    response = client.post(f"{KEYS_PATH}/999999/revoke", headers=auth_headers)
    assert response.status_code == 404


def test_models_catalog_is_available_to_admin(client, auth_headers):
    response = client.get("/api/v1/admin/models", headers=auth_headers)

    assert response.status_code == 200
    models = response.json()
    assert len(models) >= 3
    assert {"pochi-chat", "pochi-fast", "pochi-reason"} <= {
        model["public_name"] for model in models
    }
    assert all("provider_name" in model for model in models)
