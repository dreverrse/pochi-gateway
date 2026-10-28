import json

from app.core.config import settings


def _definition(nodes, edges):
    return {"nodes": nodes, "edges": edges}


def _manual_workflow(name="Alur uji"):
    return {
        "name": name,
        "description": "Uji",
        "enabled": True,
        "definition": _definition(
            [
                {"id": "start", "type": "trigger.manual", "position": {"x": 0, "y": 0}},
                {
                    "id": "set",
                    "type": "logic.set",
                    "config": {"fields": {"pesan": "halo {{input.nama}}"}},
                    "position": {"x": 240, "y": 0},
                },
            ],
            [{"id": "e1", "source": "start", "target": "set", "branch": "always"}],
        ),
    }


def test_provider_templates_available(client, auth_headers):
    response = client.get("/api/v1/admin/provider-templates", headers=auth_headers)

    assert response.status_code == 200
    templates = response.json()
    assert len(templates) >= 8
    assert all("base_url" in item and "api_key" not in item for item in templates)
    assert any(item["id"] == "openrouter" for item in templates)


def test_workflow_crud_and_manual_run(client, auth_headers):
    created = client.post(
        "/api/v1/admin/workflows", json=_manual_workflow(), headers=auth_headers
    )
    assert created.status_code == 201
    workflow = created.json()
    assert workflow["webhook_token"] is None
    workflow_id = workflow["id"]

    listed = client.get("/api/v1/admin/workflows", headers=auth_headers)
    assert listed.status_code == 200
    assert any(item["id"] == workflow_id for item in listed.json())

    run = client.post(
        f"/api/v1/admin/workflows/{workflow_id}/run",
        json={"input": {"nama": "dj"}},
        headers=auth_headers,
    )
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "success"
    assert payload["output"]["last"]["pesan"] == "halo dj"
    assert [step["status"] for step in payload["steps"]] == ["success", "success"]

    runs = client.get(f"/api/v1/admin/workflows/{workflow_id}/runs", headers=auth_headers)
    assert runs.status_code == 200
    assert runs.json()[0]["id"] == payload["id"]

    deleted = client.delete(f"/api/v1/admin/workflows/{workflow_id}", headers=auth_headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/admin/workflows/{workflow_id}", headers=auth_headers).status_code == 404


def test_workflow_requires_single_trigger(client, auth_headers):
    payload = _manual_workflow("Tanpa trigger")
    payload["definition"]["nodes"][0]["type"] = "logic.set"
    payload["definition"]["nodes"][0]["config"] = {"fields": {"a": "b"}}

    response = client.post("/api/v1/admin/workflows", json=payload, headers=auth_headers)

    assert response.status_code == 422


def test_workflow_rejects_cycle(client, auth_headers):
    payload = _manual_workflow("Siklus")
    payload["definition"]["edges"].append(
        {"id": "e2", "source": "set", "target": "start", "branch": "always"}
    )

    response = client.post("/api/v1/admin/workflows", json=payload, headers=auth_headers)

    assert response.status_code == 422


def test_schedule_interval_minimum(client, auth_headers):
    payload = {
        "name": "Jadwal cepat",
        "definition": _definition(
            [
                {
                    "id": "cron",
                    "type": "trigger.schedule",
                    "config": {"interval_seconds": 5},
                    "position": {"x": 0, "y": 0},
                }
            ],
            [],
        ),
    }

    response = client.post("/api/v1/admin/workflows", json=payload, headers=auth_headers)

    assert response.status_code == 422


def test_condition_branching(client, auth_headers):
    payload = {
        "name": "Cabang",
        "definition": _definition(
            [
                {"id": "start", "type": "trigger.manual", "position": {"x": 0, "y": 0}},
                {
                    "id": "cek",
                    "type": "logic.condition",
                    "config": {"path": "input.skor", "operator": "gt", "value": 5},
                    "position": {"x": 200, "y": 0},
                },
                {
                    "id": "ya",
                    "type": "logic.set",
                    "config": {"fields": {"hasil": "lulus"}},
                    "position": {"x": 400, "y": -80},
                },
                {
                    "id": "tidak",
                    "type": "logic.set",
                    "config": {"fields": {"hasil": "gagal"}},
                    "position": {"x": 400, "y": 80},
                },
            ],
            [
                {"id": "e1", "source": "start", "target": "cek", "branch": "always"},
                {"id": "e2", "source": "cek", "target": "ya", "branch": "true"},
                {"id": "e3", "source": "cek", "target": "tidak", "branch": "false"},
            ],
        ),
    }
    created = client.post("/api/v1/admin/workflows", json=payload, headers=auth_headers)
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    run = client.post(
        f"/api/v1/admin/workflows/{workflow_id}/run",
        json={"input": {"skor": 9}},
        headers=auth_headers,
    )
    steps = {step["node_id"]: step["status"] for step in run.json()["steps"]}
    assert steps == {"start": "success", "cek": "success", "ya": "success", "tidak": "skipped"}
    assert run.json()["output"]["nodes"]["ya"]["hasil"] == "lulus"


def test_http_node_blocks_private_host_when_public_only(client, auth_headers, monkeypatch):
    payload = {
        "name": "SSRF",
        "definition": _definition(
            [
                {"id": "start", "type": "trigger.manual", "position": {"x": 0, "y": 0}},
                {
                    "id": "req",
                    "type": "action.http",
                    "config": {"url": "http://127.0.0.1:20128/v1/models", "method": "GET"},
                    "position": {"x": 200, "y": 0},
                },
            ],
            [{"id": "e1", "source": "start", "target": "req", "branch": "always"}],
        ),
    }
    created = client.post("/api/v1/admin/workflows", json=payload, headers=auth_headers)
    assert created.status_code == 201
    workflow_id = created.json()["id"]

    monkeypatch.setattr(settings, "allow_private_provider_urls", False)
    run = client.post(
        f"/api/v1/admin/workflows/{workflow_id}/run", json={}, headers=auth_headers
    )

    assert run.status_code == 200
    assert run.json()["status"] == "error"
    assert "privat" in (run.json()["error"] or "")


def test_chat_node_with_unknown_model_fails_cleanly(client, auth_headers):
    payload = {
        "name": "Chat salah model",
        "definition": _definition(
            [
                {"id": "start", "type": "trigger.manual", "position": {"x": 0, "y": 0}},
                {
                    "id": "chat",
                    "type": "action.chat",
                    "config": {"model": "model-tidak-ada", "prompt": "hai"},
                    "position": {"x": 200, "y": 0},
                },
            ],
            [{"id": "e1", "source": "start", "target": "chat", "branch": "always"}],
        ),
    }
    created = client.post("/api/v1/admin/workflows", json=payload, headers=auth_headers)
    workflow_id = created.json()["id"]

    run = client.post(
        f"/api/v1/admin/workflows/{workflow_id}/run", json={}, headers=auth_headers
    )

    assert run.status_code == 200
    assert run.json()["status"] == "error"
    assert "tidak ada" in (run.json()["error"] or "").lower() or "exist" in (run.json()["error"] or "").lower()


def test_webhook_trigger_runs_workflow(client, auth_headers):
    payload = {
        "name": "Webhook",
        "definition": _definition(
            [
                {
                    "id": "hook",
                    "type": "trigger.webhook",
                    "position": {"x": 0, "y": 0},
                },
                {
                    "id": "echo",
                    "type": "logic.set",
                    "config": {"fields": {"pesan": "{{input.pesan}}"}},
                    "position": {"x": 200, "y": 0},
                },
            ],
            [{"id": "e1", "source": "hook", "target": "echo", "branch": "always"}],
        ),
    }
    created = client.post("/api/v1/admin/workflows", json=payload, headers=auth_headers)
    assert created.status_code == 201
    token = created.json()["webhook_token"]
    assert token

    response = client.post(f"/api/v1/hooks/{token}", json={"pesan": "dari luar"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"

    unknown = client.post("/api/v1/hooks/token-palsu", json={})
    assert unknown.status_code == 404


def test_dashboard_chat_requires_admin(client):
    response = client.post(
        "/api/v1/admin/chat",
        json={"model": "pochi-lokal", "messages": [{"role": "user", "content": "hai"}]},
    )

    assert response.status_code == 401


def test_dashboard_chat_unknown_model_shape(client, auth_headers):
    response = client.post(
        "/api/v1/admin/chat",
        json={"model": "tidak-ada", "messages": [{"role": "user", "content": "hai"}]},
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "model_not_found"
