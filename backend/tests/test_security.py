import stat

from app.core.config import Settings
from app.core.security import SecretBox, load_admin_token


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
