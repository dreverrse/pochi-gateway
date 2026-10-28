import sqlite3
from datetime import datetime, timezone

from app.core.config import settings
from app.db.database import get_connection

PROVIDER_SELECT = """
SELECT
    p.id,
    p.name,
    p.base_url,
    p.adapter_type,
    p.enabled,
    p.created_at,
    p.updated_at,
    CASE WHEN s.provider_id IS NULL THEN 0 ELSE 1 END AS has_secret
FROM providers p
LEFT JOIN provider_secrets s ON s.provider_id = p.id
"""


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _fetch(connection: sqlite3.Connection, provider_id: int) -> sqlite3.Row | None:
    return connection.execute(
        f"{PROVIDER_SELECT} WHERE p.id = ?",
        (provider_id,),
    ).fetchone()


def list_providers() -> list[sqlite3.Row]:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"{PROVIDER_SELECT} ORDER BY p.enabled DESC, p.name COLLATE NOCASE"
        ).fetchall()


def get_provider(provider_id: int) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return _fetch(connection, provider_id)


def get_provider_secret(provider_id: int) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            "SELECT ciphertext, key_version FROM provider_secrets WHERE provider_id = ?",
            (provider_id,),
        ).fetchone()


def create_provider(
    name: str,
    base_url: str,
    adapter_type: str,
    enabled: bool,
    ciphertext: str | None,
) -> sqlite3.Row:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        try:
            cursor = connection.execute(
                """
                INSERT INTO providers (name, base_url, adapter_type, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (name, base_url, adapter_type, int(enabled), stamp, stamp),
            )
            provider_id = cursor.lastrowid
            if ciphertext:
                connection.execute(
                    """
                    INSERT INTO provider_secrets (provider_id, ciphertext, key_version, updated_at)
                    VALUES (?, ?, 1, ?)
                    """,
                    (provider_id, ciphertext, stamp),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        row = _fetch(connection, provider_id)
        assert row is not None
        return row


def update_provider(
    provider_id: int,
    fields: dict[str, object],
    ciphertext: str | None,
) -> sqlite3.Row | None:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        existing = connection.execute(
            "SELECT id FROM providers WHERE id = ?",
            (provider_id,),
        ).fetchone()
        if existing is None:
            return None

        try:
            if fields:
                assignments = ", ".join(f"{field} = ?" for field in fields)
                connection.execute(
                    f"UPDATE providers SET {assignments}, updated_at = ? WHERE id = ?",
                    (*fields.values(), stamp, provider_id),
                )
            else:
                connection.execute(
                    "UPDATE providers SET updated_at = ? WHERE id = ?",
                    (stamp, provider_id),
                )

            if ciphertext:
                connection.execute(
                    """
                    INSERT INTO provider_secrets (provider_id, ciphertext, key_version, updated_at)
                    VALUES (?, ?, 1, ?)
                    ON CONFLICT(provider_id) DO UPDATE SET
                        ciphertext = excluded.ciphertext,
                        key_version = excluded.key_version,
                        updated_at = excluded.updated_at
                    """,
                    (provider_id, ciphertext, stamp),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise

        return _fetch(connection, provider_id)
