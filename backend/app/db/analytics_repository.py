"""Query agregat untuk halaman Analytics dan statistik provider.

Filter dibangun sekali di `_filters` agar totals, timeseries, dan breakdown
memakai definisi yang sama persis.
"""

import sqlite3

from app.core.config import settings
from app.db.database import get_connection
from app.db.time_window import Window

COST_SQL = "COALESCE(SUM(CASE WHEN l.cost_status IN ('known', 'estimated') THEN l.cost_usd END), 0)"


def _filters(
    window: Window,
    status: str = "all",
    provider_id: int | None = None,
    model: str | None = None,
    key_id: int | None = None,
) -> tuple[str, list[object]]:
    clause, values = window.clause("l.created_at")
    clauses = [clause]

    if status == "success":
        clauses.append("l.status_code BETWEEN 200 AND 299")
    elif status == "error":
        clauses.append("l.status_code NOT BETWEEN 200 AND 299")

    if provider_id is not None:
        clauses.append("l.provider_id = ?")
        values.append(provider_id)

    if model:
        clauses.append("l.public_model = ?")
        values.append(model)

    if key_id is not None:
        clauses.append("l.virtual_key_id = ?")
        values.append(key_id)

    return " AND ".join(clauses), values


def get_totals(
    window: Window,
    status: str,
    provider_id: int | None,
    model: str | None,
    key_id: int | None,
) -> sqlite3.Row:
    where_sql, values = _filters(window, status, provider_id, model, key_id)
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"""
            SELECT
                COUNT(*) AS total_requests,
                COALESCE(SUM(CASE WHEN l.status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END), 0) AS successful_requests,
                COALESCE(SUM(CASE WHEN l.status_code NOT BETWEEN 200 AND 299 THEN 1 ELSE 0 END), 0) AS failed_requests,
                COALESCE(SUM(l.input_tokens), 0) AS input_tokens,
                COALESCE(SUM(l.output_tokens), 0) AS output_tokens,
                COALESCE(SUM(CASE WHEN l.cost_status = 'known' THEN l.cost_usd END), 0) AS known_cost_usd,
                COALESCE(SUM(CASE WHEN l.cost_status = 'estimated' THEN l.cost_usd END), 0) AS estimated_cost_usd,
                COALESCE(SUM(CASE WHEN l.cost_status = 'unknown' THEN 1 ELSE 0 END), 0) AS unknown_cost_requests,
                COALESCE(AVG(l.duration_ms), 0) AS avg_duration_ms
            FROM request_logs l
            WHERE {where_sql}
            """,
            values,
        ).fetchone()


def get_durations(
    window: Window,
    status: str,
    provider_id: int | None,
    model: str | None,
    key_id: int | None,
) -> list[float]:
    where_sql, values = _filters(window, status, provider_id, model, key_id)
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            f"SELECT l.duration_ms FROM request_logs l WHERE {where_sql}",
            values,
        ).fetchall()
    return [float(row["duration_ms"] or 0) for row in rows]


def get_timeseries(
    window: Window,
    status: str,
    provider_id: int | None,
    model: str | None,
    key_id: int | None,
) -> dict[str, sqlite3.Row]:
    where_sql, values = _filters(window, status, provider_id, model, key_id)
    bucket = window.bucket_expression("l.created_at")
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT
                {bucket} AS bucket,
                COUNT(*) AS requests,
                COALESCE(SUM(CASE WHEN l.status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END), 0) AS successful_requests,
                COALESCE(SUM(l.input_tokens), 0) AS input_tokens,
                COALESCE(SUM(l.output_tokens), 0) AS output_tokens,
                {COST_SQL} AS cost_usd
            FROM request_logs l
            WHERE {where_sql}
            GROUP BY bucket
            """,
            values,
        ).fetchall()
    return {row["bucket"]: row for row in rows}


def get_breakdown(
    window: Window,
    status: str,
    provider_id: int | None,
    model: str | None,
    key_id: int | None,
    dimension: str,
) -> list[sqlite3.Row]:
    label, join = {
        "provider": ("COALESCE(p.name, 'Unknown provider')", "LEFT JOIN providers p ON p.id = l.provider_id"),
        "model": ("l.public_model", ""),
        "key": ("COALESCE(k.name, 'Unknown key')", "LEFT JOIN virtual_keys k ON k.id = l.virtual_key_id"),
    }[dimension]
    where_sql, values = _filters(window, status, provider_id, model, key_id)
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"""
            SELECT
                {label} AS name,
                COUNT(*) AS requests,
                COALESCE(SUM(l.input_tokens), 0) AS input_tokens,
                COALESCE(SUM(l.output_tokens), 0) AS output_tokens,
                {COST_SQL} AS cost_usd
            FROM request_logs l
            {join}
            WHERE {where_sql}
            GROUP BY {label}
            ORDER BY requests DESC
            """,
            values,
        ).fetchall()


def list_provider_usage(window: Window) -> list[sqlite3.Row]:
    """Semua provider terdaftar, termasuk yang belum pernah dipakai."""
    clause, values = window.clause("l.created_at")
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"""
            SELECT
                p.id AS provider_id,
                p.name AS name,
                COUNT(l.id) AS requests,
                COALESCE(SUM(l.input_tokens), 0) AS input_tokens,
                COALESCE(SUM(l.output_tokens), 0) AS output_tokens,
                {COST_SQL} AS cost_usd,
                COALESCE(SUM(CASE WHEN l.cost_status = 'unknown' THEN 1 ELSE 0 END), 0) AS unknown_cost_requests,
                COALESCE(SUM(CASE WHEN l.status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END), 0) AS successful_requests,
                (SELECT COUNT(*) FROM models m WHERE m.provider_id = p.id) AS models_count,
                MAX(l.created_at) AS last_request_at
            FROM providers p
            LEFT JOIN request_logs l ON l.provider_id = p.id AND {clause}
            GROUP BY p.id
            ORDER BY requests DESC, p.name COLLATE NOCASE
            """,
            values,
        ).fetchall()
