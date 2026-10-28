import os
import stat
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api import admin as admin_module
from app.core.config import Settings
from app.core.config import settings as app_settings
from app.core.security import SecretBox, load_admin_token
from app.models.providers import ProviderCreate


def test_admin_endpoints_require_token(client):
    for path in (
        "/api/v1/admin/summary",
        "/api/v1/admin/providers",
        "/api/v1/admin/keys",
        "/api/v1/admin/models",
    ):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer salah"}).status_code == 401


def test_login_rejects_invalid_token(client):
    response = client.post("/api/v1/admin/login", json={"token": "salah"})

    assert response.status_code == 401


def test_login_accepts_valid_token(client):
    response = client.post("/api/v1/admin/login", json={"token": "test-admin-token"})

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_admin_token_file_is_private(tmp_path):
    admin_token_path = tmp_path / "admin_token"
    settings = Settings(admin_token="", admin_token_path=admin_token_path)

    token = load_admin_token(settings)

    assert len(token) > 30
    assert admin_token_path.read_text(encoding="utf-8").strip() == token
    assert stat.S_IMODE(admin_token_path.stat().st_mode) == 0o600
    assert load_admin_token(settings) == token


def test_secret_box_roundtrip_and_permissions(tmp_path):
    key_path = tmp_path / "secret.key"
    box = SecretBox(key_path)

    ciphertext = box.encrypt("sk-rahasia-provider")

    assert ciphertext != "sk-rahasia-provider"
    assert box.decrypt(ciphertext) == "sk-rahasia-provider"
    assert stat.S_IMODE(key_path.stat().st_mode) == 0o600
    assert SecretBox(key_path).decrypt(ciphertext) == "sk-rahasia-provider"


def test_private_provider_url_rejected_when_public_only(monkeypatch):
    monkeypatch.setattr(app_settings, "allow_private_provider_urls", False)

    for url in (
        "http://127.0.0.1:20128/v1",
        "http://10.1.2.3/v1",
        "http://169.254.169.254/latest",
        "http://192.168.1.10/v1",
        "http://[::1]:8080/v1",
    ):
        with pytest.raises(ValidationError):
            ProviderCreate(name="Provider", base_url=url)


def test_public_provider_url_allowed_when_public_only(monkeypatch):
    monkeypatch.setattr(app_settings, "allow_private_provider_urls", False)

    payload = ProviderCreate(name="Provider", base_url="https://93.184.216.34/v1")

    assert payload.base_url == "https://93.184.216.34/v1"


def test_private_provider_url_allowed_in_local_mode():
    payload = ProviderCreate(name="Provider", base_url="http://127.0.0.1:20128/v1")

    assert payload.base_url == "http://127.0.0.1:20128/v1"


def test_login_throttle_blocks_repeated_failures(client, monkeypatch):
    monkeypatch.setattr(admin_module.login_throttle, "max_attempts", 3)
    admin_module.login_throttle.reset("testclient")

    for _ in range(3):
        response = client.post("/api/v1/admin/login", json={"token": "salah"})
        assert response.status_code == 401

    blocked = client.post("/api/v1/admin/login", json={"token": "salah"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1

    admin_module.login_throttle.reset("testclient")
    accepted = client.post("/api/v1/admin/login", json={"token": "test-admin-token"})
    assert accepted.status_code == 200


def test_security_headers_present(client):
    response = client.get("/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "default-src 'none'" in response.headers["Content-Security-Policy"]


def test_docs_skips_strict_csp(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "Content-Security-Policy" not in response.headers


def test_database_file_is_private():
    db_path = Path(os.environ["POCHI_DB_PATH"])

    assert stat.S_IMODE(db_path.stat().st_mode) == 0o600
