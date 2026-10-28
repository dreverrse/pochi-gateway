import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.db.database import get_connection


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _loads(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError):
        return fallback


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _last_run(connection: sqlite3.Connection, workflow_id: int) -> sqlite3.Row | None:
    return connection.execute(
        """
        SELECT id, status, trigger, started_at, finished_at, error
        FROM workflow_runs WHERE workflow_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (workflow_id,),
    ).fetchone()


def list_workflows() -> list[dict[str, Any]]:
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            "SELECT * FROM workflows ORDER BY id DESC"
        ).fetchall()
        return [_to_dict(connection, row, with_last_run=True) for row in rows]


def _to_dict(
    connection: sqlite3.Connection,
    row: sqlite3.Row,
    with_last_run: bool = False,
) -> dict[str, Any]:
    payload = {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "enabled": bool(row["enabled"]),
        "definition": _loads(row["definition"], {"nodes": [], "edges": []}),
        "webhook_token": row["webhook_token"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    if with_last_run:
        last = _last_run(connection, row["id"])
        payload["last_run"] = dict(last) if last else None
    return payload


def get_workflow(workflow_id: int) -> dict[str, Any] | None:
    with get_connection(settings.db_path) as connection:
        row = connection.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()
        return _to_dict(connection, row, with_last_run=True) if row else None


def get_workflow_row(workflow_id: int) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()


def get_workflow_by_token(token: str) -> sqlite3.Row | None:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            "SELECT * FROM workflows WHERE webhook_token = ?", (token,)
        ).fetchone()


def list_enabled_schedules() -> list[sqlite3.Row]:
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            "SELECT * FROM workflows WHERE enabled = 1 ORDER BY id"
        ).fetchall()


def create_workflow(
    name: str,
    description: str,
    enabled: bool,
    definition: dict[str, Any],
    webhook_token: str | None,
) -> int:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO workflows (
                name, description, enabled, definition, webhook_token,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                description,
                1 if enabled else 0,
                _dumps(definition),
                webhook_token,
                stamp,
                stamp,
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)


def update_workflow(
    workflow_id: int,
    fields: dict[str, Any],
    definition: dict[str, Any] | None,
    webhook_token: str | None = None,
) -> bool:
    assignments: list[str] = []
    values: list[Any] = []
    if "name" in fields:
        assignments.append("name = ?")
        values.append(fields["name"])
    if "description" in fields:
        assignments.append("description = ?")
        values.append(fields["description"])
    if "enabled" in fields:
        assignments.append("enabled = ?")
        values.append(1 if fields["enabled"] else 0)
    if definition is not None:
        assignments.append("definition = ?")
        values.append(_dumps(definition))
    if webhook_token is not None:
        assignments.append("webhook_token = ?")
        values.append(webhook_token)
    assignments.append("updated_at = ?")
    values.extend([_timestamp(), workflow_id])

    with get_connection(settings.db_path) as connection:
        cursor = connection.execute(
            f"UPDATE workflows SET {', '.join(assignments)} WHERE id = ?",
            values,
        )
        connection.commit()
        return cursor.rowcount > 0


def delete_workflow(workflow_id: int) -> bool:
    with get_connection(settings.db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM workflows WHERE id = ?", (workflow_id,)
        )
        connection.commit()
        return cursor.rowcount > 0


def create_run(
    workflow_id: int,
    trigger: str,
    input_data: dict[str, Any],
) -> int:
    with get_connection(settings.db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO workflow_runs (workflow_id, status, trigger, input, started_at)
            VALUES (?, 'running', ?, ?, ?)
            """,
            (workflow_id, trigger, _dumps(input_data), _timestamp()),
        )
        connection.commit()
        return int(cursor.lastrowid)


def finish_run(
    run_id: int,
    status: str,
    output: Any = None,
    error: str | None = None,
) -> None:
    with get_connection(settings.db_path) as connection:
        connection.execute(
            """
            UPDATE workflow_runs
            SET status = ?, output = ?, error = ?, finished_at = ?
            WHERE id = ?
            """,
            (status, _dumps(output) if output is not None else None, error, _timestamp(), run_id),
        )
        connection.commit()


def add_step(
    run_id: int,
    node_id: str,
    node_type: str,
    status: str,
    output: Any,
    error: str | None,
    duration_ms: int,
) -> None:
    with get_connection(settings.db_path) as connection:
        connection.execute(
            """
            INSERT INTO workflow_steps (
                run_id, node_id, node_type, status, output, error,
                duration_ms, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                node_id,
                node_type,
                status,
                _dumps(output) if output is not None else None,
                error,
                duration_ms,
                _timestamp(),
            ),
        )
        connection.commit()


def list_runs(workflow_id: int, limit: int = 20) -> list[dict[str, Any]]:
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            """
            SELECT id, status, trigger, started_at, finished_at, error
            FROM workflow_runs WHERE workflow_id = ?
            ORDER BY id DESC LIMIT ?
            """,
            (workflow_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]


def get_run(run_id: int) -> dict[str, Any] | None:
    with get_connection(settings.db_path) as connection:
        row = connection.execute(
            "SELECT * FROM workflow_runs WHERE id = ?", (run_id,)
        ).fetchone()
        if row is None:
            return None
        steps = connection.execute(
            """
            SELECT node_id, node_type, status, output, error, duration_ms
            FROM workflow_steps WHERE run_id = ? ORDER BY id
            """,
            (run_id,),
        ).fetchall()
        return {
            "id": row["id"],
            "workflow_id": row["workflow_id"],
            "status": row["status"],
            "trigger": row["trigger"],
            "input": _loads(row["input"], None),
            "output": _loads(row["output"], None),
            "error": row["error"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "steps": [
                {
                    "node_id": step["node_id"],
                    "node_type": step["node_type"],
                    "status": step["status"],
                    "output": _loads(step["output"], None),
                    "error": step["error"],
                    "duration_ms": step["duration_ms"],
                }
                for step in steps
            ],
        }
