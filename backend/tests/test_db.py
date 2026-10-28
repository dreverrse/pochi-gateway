import sqlite3

from app.core.config import settings
from app.db.database import get_connection

EXPECTED_TABLES = {
    "providers",
    "provider_secrets",
    "virtual_keys",
    "models",
    "model_prices",
    "request_logs",
}


def test_schema_and_foreign_keys(client):
    with get_connection(settings.db_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        assert EXPECTED_TABLES <= tables
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1

        try:
            connection.execute(
                "INSERT INTO provider_secrets (provider_id, ciphertext, key_version, updated_at) VALUES (?, ?, ?, ?)",
                (9999, "not-a-secret", 1, "2026-01-01 00:00:00"),
            )
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("foreign key provider_secrets seharusnya menolak provider tidak valid")
