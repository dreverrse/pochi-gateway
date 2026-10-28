import sqlite3
from datetime import datetime, timezone

from app.core.config import settings
from app.db.database import get_connection

KEY_SELECT = """
SELECT
    id,
    name,
    key_prefix,
    allowed_models,
    budget_limit_usd,
    budget_period,
    enabled,
    created_at,
    last_used_at,
    revoked_at
FROM virtual_keys
"""


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _fetch(connection: sqlite3.Connection, key_id: int) -> sqlite3.Row | None:
    return connection.execute(f"{KEY_SELECT} WHERE id = ?", (key_id,)).fetchone()


def list_keys() -> list[sqlite3.Row]:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"{KEY_SELECT} ORDER BY (revoked_at IS NOT NULL), created_at DESC, id DESC"
        ).fetchall()


def get_key(key_id: int) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return _fetch(connection, key_id)


def create_key(
    name: str,
    key_prefix: str,
    key_hash: str,
    allowed_models: str,
    budget_limit_usd: float | None,
    budget_period: str,
    enabled: bool,
) -> sqlite3.Row:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        try:
            cursor = connection.execute(
                """
                INSERT INTO virtual_keys (
                    name, key_prefix, key_hash, allowed_models,
                    budget_limit_usd, budget_period, enabled, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    key_prefix,
                    key_hash,
                    allowed_models,
                    budget_limit_usd,
                    budget_period,
                    int(enabled),
                    stamp,
                ),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        row = _fetch(connection, cursor.lastrowid)
        assert row is not None
        return row


def update_key(key_id: int, fields: dict[str, object]) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        existing = connection.execute(
            "SELECT id FROM virtual_keys WHERE id = ?",
            (key_id,),
        ).fetchone()
        if existing is None:
            return None

        if fields:
            assignments = ", ".join(f"{field} = ?" for field in fields)
            try:
                connection.execute(
                    f"UPDATE virtual_keys SET {assignments} WHERE id = ?",
                    (*fields.values(), key_id),
                )
                connection.commit()
            except Exception:
                connection.rollback()
                raise

        return _fetch(connection, key_id)


def revoke_key(key_id: int) -> sqlite3.Row | None:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        existing = connection.execute(
            "SELECT id, revoked_at FROM virtual_keys WHERE id = ?",
            (key_id,),
        ).fetchone()
        if existing is None:
            return None

        if existing["revoked_at"] is None:
            connection.execute(
                "UPDATE virtual_keys SET enabled = 0, revoked_at = ? WHERE id = ?",
                (stamp, key_id),
            )
            connection.commit()

        return _fetch(connection, key_id)
