import uuid

MODELS_PATH = "/api/v1/admin/models"


def _unique_name() -> str:
    return f"test-model-{uuid.uuid4().hex[:8]}"


def _provider_id(client, auth_headers) -> int:
    providers = client.get("/api/v1/admin/providers", headers=auth_headers).json()
    return providers[0]["id"]


def test_list_models_includes_provider_metadata(client, auth_headers):
    response = client.get(MODELS_PATH, headers=auth_headers)

    assert response.status_code == 200
    models = response.json()
    assert len(models) >= 3
    for model in models:
        assert model["provider_name"]
        assert isinstance(model["provider_id"], int)
        assert model["public_name"]
        assert model["provider_model"]
        assert isinstance(model["enabled"], bool)
    demo = next(model for model in models if model["public_name"] == "pochi-chat")
    assert demo["input_usd_per_million"] == 0.15
    assert demo["output_usd_per_million"] == 0.6
    assert demo["price_updated_at"]


def test_create_and_update_model(client, auth_headers):
    provider_id = _provider_id(client, auth_headers)
    name = _unique_name()

    response = client.post(
        MODELS_PATH,
        json={
            "public_name": name,
            "provider_id": provider_id,
            "provider_model": "upstream-model-v1",
            "input_usd_per_million": 1.25,
            "output_usd_per_million": 5.0,
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    created = response.json()
    assert created["public_name"] == name
    assert created["provider_id"] == provider_id
    assert created["provider_model"] == "upstream-model-v1"
    assert created["input_usd_per_million"] == 1.25
    assert created["output_usd_per_million"] == 5.0
    assert created["enabled"] is True

    response = client.patch(
        f"{MODELS_PATH}/{created['id']}",
        json={
            "public_name": f"{name}-baru",
            "provider_model": "upstream-model-v2",
            "enabled": False,
            "input_usd_per_million": 2.5,
            "output_usd_per_million": 7.5,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["public_name"] == f"{name}-baru"
    assert updated["provider_model"] == "upstream-model-v2"
    assert updated["input_usd_per_million"] == 2.5
    assert updated["output_usd_per_million"] == 7.5
    assert updated["enabled"] is False


def test_duplicate_model_name_is_rejected(client, auth_headers):
    provider_id = _provider_id(client, auth_headers)
    name = _unique_name()
    payload = {
        "public_name": name,
        "provider_id": provider_id,
        "provider_model": "upstream-model",
    }

    assert client.post(MODELS_PATH, json=payload, headers=auth_headers).status_code == 201
    assert client.post(MODELS_PATH, json=payload, headers=auth_headers).status_code == 409


def test_model_validates_provider_and_name(client, auth_headers):
    response = client.post(
        MODELS_PATH,
        json={
            "public_name": _unique_name(),
            "provider_id": 999999,
            "provider_model": "upstream-model",
        },
        headers=auth_headers,
    )
    assert response.status_code == 422

    response = client.post(
        MODELS_PATH,
        json={
            "public_name": "nama model dengan spasi",
            "provider_id": _provider_id(client, auth_headers),
            "provider_model": "upstream-model",
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_model_price_pair_is_required(client, auth_headers):
    response = client.post(
        MODELS_PATH,
        json={
            "public_name": _unique_name(),
            "provider_id": _provider_id(client, auth_headers),
            "provider_model": "upstream-model",
            "input_usd_per_million": 1.0,
        },
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_unknown_model_update_returns_404(client, auth_headers):
    response = client.patch(
        f"{MODELS_PATH}/999999",
        json={"enabled": False},
        headers=auth_headers,
    )

    assert response.status_code == 404
