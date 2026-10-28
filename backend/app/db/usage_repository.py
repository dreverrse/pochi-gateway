import sqlite3

from app.core.config import settings
from app.db.database import get_connection
from app.db.time_window import Window

LOG_COLUMNS = """
    l.id,
    l.request_id,
    k.name AS key_name,
    p.name AS provider_name,
    l.public_model,
    l.provider_model,
    l.input_tokens,
    l.output_tokens,
    l.cost_usd,
    l.cost_status,
    l.status_code,
    l.duration_ms,
    l.streamed,
    l.error_code,
    l.created_at
"""

LOG_FROM = """
FROM request_logs l
LEFT JOIN virtual_keys k ON k.id = l.virtual_key_id
LEFT JOIN providers p ON p.id = l.provider_id
"""

LOG_SELECT = f"SELECT {LOG_COLUMNS} {LOG_FROM}"


def _filters(
    window: Window,
    status: str,
    model: str | None,
    key_id: int | None,
    provider_id: int | None = None,
    search: str | None = None,
) -> tuple[str, list[object]]:
    clause, values = window.clause("l.created_at")
    clauses = [clause]

    if status == "success":
        clauses.append("l.status_code BETWEEN 200 AND 299")
    elif status == "error":
        clauses.append("l.status_code NOT BETWEEN 200 AND 299")

    if model:
        clauses.append("l.public_model = ?")
        values.append(model)

    if key_id is not None:
        clauses.append("l.virtual_key_id = ?")
        values.append(key_id)

    if provider_id is not None:
        clauses.append("l.provider_id = ?")
        values.append(provider_id)

    if search:
        pattern = f"%{search.strip()}%"
        clauses.append(
            "(l.request_id LIKE ? OR l.public_model LIKE ? OR l.provider_model LIKE ?"
            " OR p.name LIKE ? OR k.name LIKE ?)"
        )
        values.extend([pattern] * 5)

    return " AND ".join(clauses), values


def list_request_logs(
    window: Window,
    status: str,
    model: str | None,
    key_id: int | None,
    page: int,
    page_size: int,
    provider_id: int | None = None,
    search: str | None = None,
) -> tuple[list[sqlite3.Row], int]:
    where_sql, values = _filters(window, status, model, key_id, provider_id, search)
    offset = (page - 1) * page_size

    with get_connection(settings.db_path) as connection:
        total = connection.execute(
            f"SELECT COUNT(*) {LOG_FROM} WHERE {where_sql}",
            values,
        ).fetchone()[0]
        rows = connection.execute(
            f"""
            {LOG_SELECT}
            WHERE {where_sql}
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT ? OFFSET ?
            """,
            (*values, page_size, offset),
        ).fetchall()

    return rows, int(total)


def list_request_logs_all(
    window: Window,
    status: str,
    model: str | None,
    key_id: int | None,
    provider_id: int | None = None,
    search: str | None = None,
) -> list[sqlite3.Row]:
    where_sql, values = _filters(window, status, model, key_id, provider_id, search)
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            f"""
            {LOG_SELECT}
            WHERE {where_sql}
            ORDER BY l.created_at DESC, l.id DESC
            """,
            values,
        ).fetchall()
    return rows
