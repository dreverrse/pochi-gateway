import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_DIR = Path(tempfile.mkdtemp(prefix="pochi-gateway-tests-"))
TEST_ADMIN_TOKEN = "test-admin-token"
os.environ["POCHI_DB_PATH"] = str(TEST_DIR / "pochi-test.db")
os.environ["POCHI_SEED_DEMO"] = "true"
os.environ["POCHI_ADMIN_TOKEN"] = TEST_ADMIN_TOKEN
os.environ["POCHI_SECRET_KEY_PATH"] = str(TEST_DIR / "secret.key")
os.environ["POCHI_PROVIDER_TIMEOUT_SECONDS"] = "2"

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def auth_headers():
    return {"Authorization": f"Bearer {TEST_ADMIN_TOKEN}"}
