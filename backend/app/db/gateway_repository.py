import sqlite3
from datetime import datetime, timezone

from app.core.config import settings
from app.db.database import get_connection

AVAILABLE_MODEL_SELECT = """
SELECT
    m.public_name,
    m.created_at,
    p.name AS provider_name
FROM models m
JOIN providers p ON p.id = m.provider_id
WHERE m.enabled = 1 AND p.enabled = 1
"""

MODEL_ROUTE_SELECT = """
SELECT
    m.id AS model_id,
    m.public_name,
    m.provider_model,
    m.enabled AS model_enabled,
    p.id AS provider_id,
    p.name AS provider_name,
    p.base_url,
    p.adapter_type,
    p.enabled AS provider_enabled,
    CASE WHEN s.provider_id IS NULL THEN 0 ELSE 1 END AS has_secret
FROM models m
JOIN providers p ON p.id = m.provider_id
LEFT JOIN provider_secrets s ON s.provider_id = p.id
WHERE m.public_name = ?
"""


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def find_virtual_key_by_hash(key_hash: str) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            """
            SELECT
                id,
                name,
                allowed_models,
                enabled,
                revoked_at,
                budget_limit_usd,
                budget_period
            FROM virtual_keys
            WHERE key_hash = ?
            """,
            (key_hash,),
        ).fetchone()


def touch_virtual_key(key_id: int) -> None:
    with get_connection(settings.db_path) as connection:
        connection.execute(
            "UPDATE virtual_keys SET last_used_at = ? WHERE id = ?",
            (_timestamp(), key_id),
        )
        connection.commit()


def budget_spend(key_id: int, budget_period: str) -> float:
    period_sql = (
        "date(rl.created_at) = date('now')"
        if budget_period == "daily"
        else "strftime('%Y-%m', rl.created_at) = strftime('%Y-%m', 'now')"
    )
    with get_connection(settings.db_path) as connection:
        row = connection.execute(
            f"""
            SELECT COALESCE(SUM(rl.cost_usd), 0) AS spend
            FROM request_logs rl
            WHERE rl.virtual_key_id = ?
              AND rl.cost_status IN ('known', 'estimated')
              AND {period_sql}
            """,
            (key_id,),
        ).fetchone()
    return float(row["spend"] or 0)


def consume_rate_limit(key_id: int, window_start: int) -> int:
    with get_connection(settings.db_path) as connection:
        connection.execute(
            "DELETE FROM rate_limit_windows WHERE window_start < ?",
            (window_start - 3600,),
        )
        row = connection.execute(
            """
            INSERT INTO rate_limit_windows (virtual_key_id, window_start, count)
            VALUES (?, ?, 1)
            ON CONFLICT(virtual_key_id, window_start)
            DO UPDATE SET count = count + 1
            RETURNING count
            """,
            (key_id, window_start),
        ).fetchone()
        connection.commit()
    return int(row["count"])


def list_available_models() -> list[sqlite3.Row]:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"{AVAILABLE_MODEL_SELECT} ORDER BY m.public_name COLLATE NOCASE"
        ).fetchall()


def get_model_route(public_name: str) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return connection.execute(MODEL_ROUTE_SELECT, (public_name,)).fetchone()


def create_request_log(
    request_id: str,
    virtual_key_id: int,
    provider_id: int,
    public_model: str,
    provider_model: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float | None,
    cost_status: str,
    status_code: int,
    duration_ms: int,
    streamed: bool,
    error_code: str | None,
    created_at: datetime,
    finished_at: datetime,
) -> None:
    with get_connection(settings.db_path) as connection:
        connection.execute(
            """
            INSERT INTO request_logs (
                request_id, virtual_key_id, provider_id, public_model, provider_model,
                input_tokens, output_tokens, cost_usd, cost_status, status_code,
                duration_ms, streamed, error_code, created_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                virtual_key_id,
                provider_id,
                public_model,
                provider_model,
                input_tokens,
                output_tokens,
                cost_usd,
                cost_status,
                status_code,
                duration_ms,
                int(streamed),
                error_code,
                created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                finished_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )
        connection.commit()
