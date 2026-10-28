"""Test backlog PRD: rate limit per key, budget spent, riwayat harga, export."""
import uuid


KEYS_PATH = "/api/v1/admin/keys"


def _unique_name() -> str:
    return f"Backlog Key {uuid.uuid4().hex[:8]}"


def _create(client, auth_headers, **overrides):
    payload = {
        "name": _unique_name(),
        "allowed_models": ["pochi-chat"],
        "budget_limit_usd": 10.0,
        "budget_period": "monthly",
        "enabled": True,
    }
    payload.update(overrides)
    response = client.post(KEYS_PATH, json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_key_accepts_rate_limit_per_key(client, auth_headers):
    body = _create(client, auth_headers, rate_limit_rpm=30)
    key = body["key"]
    assert key["rate_limit_rpm"] == 30
    assert "budget_spent_usd" in key

    response = client.patch(
        f"{KEYS_PATH}/{key['id']}",
        json={"rate_limit_rpm": 0},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["rate_limit_rpm"] == 0

    response = client.patch(
        f"{KEYS_PATH}/{key['id']}",
        json={"rate_limit_rpm": None},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["rate_limit_rpm"] is None


def test_create_key_rejects_invalid_rate_limit(client, auth_headers):
    response = client.post(
        KEYS_PATH,
        json={"name": _unique_name(), "rate_limit_rpm": -5},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_list_keys_expose_budget_spent(client, auth_headers):
    keys = client.get(KEYS_PATH, headers=auth_headers).json()
    assert keys
    for key in keys:
        assert "budget_spent_usd" in key
        assert key["budget_spent_usd"] is None or key["budget_spent_usd"] >= 0


def test_price_history_endpoint(client, auth_headers):
    response = client.get(
        "/api/v1/admin/prices/history",
        params={"provider_model": "gpt-4o-mini"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)

    # param wajib
    assert client.get(
        "/api/v1/admin/prices/history", headers=auth_headers
    ).status_code == 422


def test_export_usage_csv(client, auth_headers):
    response = client.get(
        "/api/v1/admin/usage/export",
        params={"format": "csv", "days": 14},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    header = response.text.splitlines()[0]
    assert header.startswith("id,")
    assert "request_id" in header
    assert len(response.text.splitlines()) >= 2  # header + minimal 1 baris


def test_export_usage_json(client, auth_headers):
    response = client.get(
        "/api/v1/admin/usage/export",
        params={"format": "json"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]
    data = response.json()
    assert isinstance(data, list) and data
    assert "request_id" in data[0]
    assert "cost_status" in data[0]
