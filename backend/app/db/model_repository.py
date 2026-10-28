import sqlite3
from datetime import datetime, timezone

from app.core.config import settings
from app.db.database import get_connection

MODEL_SELECT = """
SELECT
    m.id,
    m.public_name,
    m.provider_id,
    m.provider_model,
    m.enabled,
    m.created_at,
    m.updated_at,
    p.name AS provider_name
FROM models m
JOIN providers p ON p.id = m.provider_id
"""


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _fetch(connection: sqlite3.Connection, model_id: int) -> sqlite3.Row | None:
    return connection.execute(
        f"{MODEL_SELECT} WHERE m.id = ?",
        (model_id,),
    ).fetchone()


def _save_price(
    connection: sqlite3.Connection,
    provider_model: str,
    input_usd_per_million: float,
    output_usd_per_million: float,
    stamp: str,
) -> None:
    connection.execute(
        """
        UPDATE model_prices
        SET effective_until = ?, updated_at = ?
        WHERE provider_model = ?
          AND (effective_until IS NULL OR effective_until > ?)
        """,
        (stamp, stamp, provider_model, stamp),
    )
    connection.execute(
        """
        INSERT INTO model_prices (
            provider_model, input_usd_per_million, output_usd_per_million,
            effective_from, source, updated_at
        ) VALUES (?, ?, ?, ?, 'admin', ?)
        """,
        (
            provider_model,
            input_usd_per_million,
            output_usd_per_million,
            stamp,
            stamp,
        ),
    )


def list_models() -> list[sqlite3.Row]:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"{MODEL_SELECT} ORDER BY m.public_name COLLATE NOCASE"
        ).fetchall()


def get_model(model_id: int) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return _fetch(connection, model_id)


def create_model(
    public_name: str,
    provider_id: int,
    provider_model: str,
    enabled: bool,
    input_usd_per_million: float | None = None,
    output_usd_per_million: float | None = None,
) -> sqlite3.Row:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        try:
            cursor = connection.execute(
                """
                INSERT INTO models (
                    public_name, provider_id, provider_model, enabled, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (public_name, provider_id, provider_model, int(enabled), stamp, stamp),
            )
            if input_usd_per_million is not None and output_usd_per_million is not None:
                _save_price(
                    connection,
                    provider_model,
                    input_usd_per_million,
                    output_usd_per_million,
                    stamp,
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        row = _fetch(connection, cursor.lastrowid)
        assert row is not None
        return row


def update_model(
    model_id: int,
    fields: dict[str, object],
    input_usd_per_million: float | None = None,
    output_usd_per_million: float | None = None,
) -> sqlite3.Row | None:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        existing = connection.execute(
            "SELECT id, provider_model FROM models WHERE id = ?",
            (model_id,),
        ).fetchone()
        if existing is None:
            return None

        try:
            if fields:
                assignments = ", ".join(f"{field} = ?" for field in fields)
                connection.execute(
                    f"UPDATE models SET {assignments}, updated_at = ? WHERE id = ?",
                    (*fields.values(), stamp, model_id),
                )
            else:
                connection.execute(
                    "UPDATE models SET updated_at = ? WHERE id = ?",
                    (stamp, model_id),
                )

            if input_usd_per_million is not None and output_usd_per_million is not None:
                provider_model = str(fields.get("provider_model", existing["provider_model"]))
                _save_price(
                    connection,
                    provider_model,
                    input_usd_per_million,
                    output_usd_per_million,
                    stamp,
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise

        return _fetch(connection, model_id)
