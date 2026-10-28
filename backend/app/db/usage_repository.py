import sqlite3

from app.core.config import settings
from app.db.database import get_connection

LOG_SELECT = """
SELECT
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
FROM request_logs l
LEFT JOIN virtual_keys k ON k.id = l.virtual_key_id
LEFT JOIN providers p ON p.id = l.provider_id
"""


def _filters(
    days: int,
    status: str,
    model: str | None,
    key_id: int | None,
) -> tuple[str, list[object]]:
    clauses = ["date(l.created_at) >= date('now', ?)"]
    values: list[object] = [f"-{days - 1} days"]

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

    return " AND ".join(clauses), values


def list_request_logs(
    days: int,
    status: str,
    model: str | None,
    key_id: int | None,
    page: int,
    page_size: int,
) -> tuple[list[sqlite3.Row], int]:
    where_sql, values = _filters(days, status, model, key_id)
    offset = (page - 1) * page_size

    with get_connection(settings.db_path) as connection:
        total = connection.execute(
            f"SELECT COUNT(*) FROM request_logs l WHERE {where_sql}",
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
