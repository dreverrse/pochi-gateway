import sqlite3
from datetime import datetime, timezone

from app.core.config import settings
from app.db.database import get_connection

DEFAULT_TITLE = "Percakapan baru"

CONVERSATION_SELECT = """
SELECT
    c.id,
    c.title,
    c.model,
    c.system_prompt,
    c.temperature,
    c.max_tokens,
    c.pinned,
    c.created_at,
    c.updated_at,
    (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count,
    (
        SELECT substr(m2.content, 1, 120)
        FROM conversation_messages m2
        WHERE m2.conversation_id = c.id
        ORDER BY m2.id DESC
        LIMIT 1
    ) AS preview
FROM conversations c
"""

MESSAGE_SELECT = """
SELECT
    id, conversation_id, role, content, status, model, provider_name,
    input_tokens, output_tokens, total_tokens, cost_usd, cost_status,
    duration_ms, error_message, created_at
FROM conversation_messages
"""


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _conversation_row(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["pinned"] = bool(data["pinned"])
    return data


def list_conversations(search: str | None = None) -> list[dict]:
    query = CONVERSATION_SELECT
    params: tuple = ()
    if search:
        query += " WHERE c.title LIKE ?"
        params = (f"%{search}%",)
    query += " ORDER BY c.pinned DESC, c.updated_at DESC, c.id DESC"
    with get_connection(settings.db_path) as connection:
        return [
            _conversation_row(row)
            for row in connection.execute(query, params).fetchall()
        ]


def get_conversation(conversation_id: int) -> dict | None:
    with get_connection(settings.db_path) as connection:
        row = connection.execute(
            f"{CONVERSATION_SELECT} WHERE c.id = ?",
            (conversation_id,),
        ).fetchone()
    return _conversation_row(row) if row else None


def list_messages(conversation_id: int) -> list[dict]:
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            f"{MESSAGE_SELECT} WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def create_conversation(
    *,
    title: str | None,
    model: str,
    system_prompt: str = "",
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO conversations (
                title, model, system_prompt, temperature, max_tokens,
                pinned, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (title or DEFAULT_TITLE, model, system_prompt, temperature, max_tokens, stamp, stamp),
        )
        connection.commit()
        conversation_id = int(cursor.lastrowid)
    return get_conversation(conversation_id)


def update_conversation(conversation_id: int, fields: dict) -> dict | None:
    allowed = {"title", "model", "system_prompt", "temperature", "max_tokens", "pinned"}
    updates = {key: value for key, value in fields.items() if key in allowed and value is not None}
    if not updates:
        return get_conversation(conversation_id)
    if "pinned" in updates:
        updates["pinned"] = 1 if updates["pinned"] else 0
    updates["updated_at"] = _timestamp()
    assignments = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [conversation_id]
    with get_connection(settings.db_path) as connection:
        connection.execute(
            f"UPDATE conversations SET {assignments} WHERE id = ?",
            values,
        )
        connection.commit()
    return get_conversation(conversation_id)


def touch_conversation(conversation_id: int, model: str | None = None) -> None:
    with get_connection(settings.db_path) as connection:
        if model:
            connection.execute(
                "UPDATE conversations SET updated_at = ?, model = ? WHERE id = ?",
                (_timestamp(), model, conversation_id),
            )
        else:
            connection.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (_timestamp(), conversation_id),
            )
        connection.commit()


def set_title_if_default(conversation_id: int, title: str) -> None:
    with get_connection(settings.db_path) as connection:
        connection.execute(
            "UPDATE conversations SET title = ? WHERE id = ? AND (title = ? OR title = '')",
            (title, conversation_id, DEFAULT_TITLE),
        )
        connection.commit()


def delete_conversation(conversation_id: int) -> bool:
    with get_connection(settings.db_path) as connection:
        cursor = connection.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        connection.commit()
        return cursor.rowcount > 0


def clear_messages(conversation_id: int) -> None:
    with get_connection(settings.db_path) as connection:
        connection.execute(
            "DELETE FROM conversation_messages WHERE conversation_id = ?",
            (conversation_id,),
        )
        connection.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (_timestamp(), conversation_id),
        )
        connection.commit()


def add_message(
    conversation_id: int,    *,
    role: str,
    content: str,
    status: str = "complete",
    model: str | None = None,
    provider_name: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cost_usd: float | None = None,
    cost_status: str | None = None,
    duration_ms: int | None = None,
    error_message: str | None = None,
    touch: bool = True,
) -> int:
    total_tokens = (
        (input_tokens or 0) + (output_tokens or 0)
        if input_tokens is not None or output_tokens is not None
        else None
    )
    stamp = _timestamp()
    with get_connection(settings.db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO conversation_messages (
                conversation_id, role, content, status, model, provider_name,
                input_tokens, output_tokens, total_tokens, cost_usd, cost_status,
                duration_ms, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conversation_id,
                role,
                content,
                status,
                model,
                provider_name,
                input_tokens,
                output_tokens,
                total_tokens,
                cost_usd,
                cost_status,
                duration_ms,
                error_message,
                stamp,
            ),
        )
        if touch:
            connection.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (stamp, conversation_id),
            )
        connection.commit()
        return int(cursor.lastrowid)


def delete_message(conversation_id: int, message_id: int) -> bool:
    with get_connection(settings.db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM conversation_messages WHERE id = ? AND conversation_id = ?",
            (message_id, conversation_id),
        )
        connection.commit()
        return cursor.rowcount > 0


def conversation_messages_for_context(conversation_id: int, limit: int = 40) -> list[dict]:
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            """
            SELECT role, content FROM conversation_messages
            WHERE conversation_id = ? AND status IN ('complete', 'stopped') AND role != 'system'
            ORDER BY id DESC
            LIMIT ?
            """,
            (conversation_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]
