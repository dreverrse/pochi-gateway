def test_summary_returns_demo_usage(client, auth_headers):
    response = client.get("/api/v1/admin/summary", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_requests"] > 0
    assert body["successful_requests"] + body["failed_requests"] == body["total_requests"]
    assert body["input_tokens"] > 0
    assert body["output_tokens"] > 0
    assert body["known_cost_usd"] > 0
    assert body["estimated_cost_usd"] >= 0
    assert body["unknown_cost_requests"] > 0
    assert len(body["timeseries"]) == 14
    assert body["by_model"]
    assert body["by_provider"]
    assert body["by_key"]


def test_timeseries_window(client, auth_headers):
    response = client.get(
        "/api/v1/admin/usage/timeseries",
        params={"days": 7},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert len(response.json()) == 7


def test_usage_logs_are_paginated(client, auth_headers):
    response = client.get(
        "/api/v1/admin/usage/logs",
        params={"days": 30, "page": 1, "page_size": 7},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 7
    assert body["page"] == 1
    assert body["page_size"] == 7
    assert len(body["items"]) == 7
    assert body["total_pages"] > 1
    first = body["items"][0]
    assert first["request_id"]
    assert first["public_model"]
    assert first["cost_status"] in {"known", "estimated", "unknown"}
    assert isinstance(first["streamed"], bool)

    second = client.get(
        "/api/v1/admin/usage/logs",
        params={"days": 30, "page": 2, "page_size": 7},
        headers=auth_headers,
    ).json()
    assert {item["id"] for item in second["items"]}.isdisjoint(
        {item["id"] for item in body["items"]}
    )


def test_usage_logs_filters(client, auth_headers):
    logs = client.get(
        "/api/v1/admin/usage/logs",
        params={"days": 30, "page_size": 100},
        headers=auth_headers,
    ).json()["items"]
    model = logs[0]["public_model"]
    key_id = client.get("/api/v1/admin/keys", headers=auth_headers).json()[0]["id"]
    key_name = client.get("/api/v1/admin/keys", headers=auth_headers).json()[0]["name"]

    by_model = client.get(
        "/api/v1/admin/usage/logs",
        params={"days": 30, "model": model},
        headers=auth_headers,
    ).json()
    assert by_model["items"]
    assert all(item["public_model"] == model for item in by_model["items"])

    by_key = client.get(
        "/api/v1/admin/usage/logs",
        params={"days": 30, "key_id": key_id},
        headers=auth_headers,
    ).json()
    assert by_key["items"]
    assert all(item["key_name"] == key_name for item in by_key["items"])

    errors = client.get(
        "/api/v1/admin/usage/logs",
        params={"days": 30, "status": "error", "page_size": 100},
        headers=auth_headers,
    ).json()
    assert errors["items"]
    assert all(not 200 <= item["status_code"] <= 299 for item in errors["items"])


def test_usage_logs_reject_invalid_filters(client, auth_headers):
    assert client.get(
        "/api/v1/admin/usage/logs",
        params={"status": "invalid"},
        headers=auth_headers,
    ).status_code == 422
    assert client.get(
        "/api/v1/admin/usage/logs",
        params={"days": 0},
        headers=auth_headers,
    ).status_code == 422
    assert client.get(
        "/api/v1/admin/usage/logs",
        params={"page_size": 101},
        headers=auth_headers,
    ).status_code == 422
