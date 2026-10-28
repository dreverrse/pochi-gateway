"""Kontrak API yang dipakai dashboard baru: perbandingan periode, analytics,
statistik provider, filter log, flag model, dan settings runtime."""

import uuid

SUMMARY = "/api/v1/admin/summary"
LOGS = "/api/v1/admin/usage/logs"
ANALYTICS = "/api/v1/admin/analytics"
PROVIDER_STATS = "/api/v1/admin/providers/stats"
MODELS = "/api/v1/admin/models"
PROVIDERS = "/api/v1/admin/providers"
SETTINGS = "/api/v1/admin/settings"


def test_summary_exposes_previous_period(client, auth_headers):
    body = client.get(SUMMARY, params={"days": 7}, headers=auth_headers).json()
    assert body["previous"] is not None
    assert "total_requests" in body["previous"]
    assert "known_cost_usd" in body["previous"]
    assert len(body["timeseries"]) == 7


def test_summary_hourly_window(client, auth_headers):
    body = client.get(SUMMARY, params={"hours": 24}, headers=auth_headers).json()
    assert len(body["timeseries"]) == 24
    assert all(point["date"].endswith(":00") for point in body["timeseries"])


def test_analytics_returns_aggregates_and_percentiles(client, auth_headers):
    body = client.get(ANALYTICS, params={"days": 30}, headers=auth_headers).json()
    for field in (
        "total_requests",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "success_rate",
        "known_cost_usd",
        "p50_duration_ms",
        "p95_duration_ms",
    ):
        assert field in body
    assert body["total_tokens"] == body["input_tokens"] + body["output_tokens"]
    assert body["p95_duration_ms"] >= body["p50_duration_ms"]
    assert len(body["timeseries"]) == 30


def test_analytics_status_filter_narrows_result(client, auth_headers):
    success = client.get(
        ANALYTICS, params={"days": 30, "status": "success"}, headers=auth_headers
    ).json()
    error = client.get(
        ANALYTICS, params={"days": 30, "status": "error"}, headers=auth_headers
    ).json()
    both = client.get(ANALYTICS, params={"days": 30}, headers=auth_headers).json()
    assert success["failed_requests"] == 0
    assert error["successful_requests"] == 0
    assert success["total_requests"] + error["total_requests"] == both["total_requests"]


def test_provider_stats_cover_registered_providers(client, auth_headers):
    providers = client.get(PROVIDERS, headers=auth_headers).json()
    stats = client.get(PROVIDER_STATS, params={"days": 30}, headers=auth_headers).json()
    assert {row["provider_id"] for row in stats} == {row["id"] for row in providers}
    for row in stats:
        assert row["models_count"] >= 0
        assert row["requests"] >= row["successful_requests"]


def test_usage_logs_search_and_provider_filter(client, auth_headers):
    logs = client.get(LOGS, params={"days": 30}, headers=auth_headers).json()
    assert logs["items"]
    sample = logs["items"][0]

    by_model = client.get(
        LOGS, params={"days": 30, "search": sample["public_model"]}, headers=auth_headers
    ).json()
    assert by_model["total"] >= 1
    assert all(
        sample["public_model"] in (item["public_model"], item["provider_model"])
        or sample["public_model"] in (item["provider_name"] or "")
        or sample["public_model"] in (item["key_name"] or "")
        for item in by_model["items"]
    )

    providers = client.get(PROVIDERS, headers=auth_headers).json()
    provider_id = providers[0]["id"]
    filtered = client.get(
        LOGS, params={"days": 30, "provider_id": provider_id}, headers=auth_headers
    ).json()
    assert all(item["provider_name"] == providers[0]["name"] for item in filtered["items"])


def test_model_flags_streaming_and_default(client, auth_headers):
    providers = client.get(PROVIDERS, headers=auth_headers).json()
    provider_id = providers[0]["id"]
    name = f"ui-flag-{uuid.uuid4().hex[:8]}"

    created = client.post(
        MODELS,
        json={
            "public_name": name,
            "provider_id": provider_id,
            "provider_model": "demo/ui-flags",
            "supports_streaming": True,
            "is_default": True,
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    model = created.json()
    assert model["supports_streaming"] is True
    assert model["is_default"] is True

    patched = client.patch(
        f"{MODELS}/{model['id']}",
        json={"supports_streaming": False},
        headers=auth_headers,
    ).json()
    assert patched["supports_streaming"] is False
    assert patched["is_default"] is True


def test_settings_endpoint_hides_secrets(client, auth_headers):
    body = client.get(SETTINGS, headers=auth_headers).json()
    assert body["app_version"]
    assert isinstance(body["cors_origins"], list)
    serialized = str(body).lower()
    for forbidden in ("token", "secret", "ciphertext", "password"):
        assert forbidden not in serialized
