import logging

from app.db import conversation_repository as repository
from app.db.conversation_repository import DEFAULT_TITLE
from app.services import pricing as pricing_service

logger = logging.getLogger(__name__)

MAX_TITLE = 60


class ConversationNotFoundError(Exception):
    pass


def derive_title(text: str) -> str:
    cleaned = " ".join((text or "").split())
    if not cleaned:
        return DEFAULT_TITLE
    if len(cleaned) <= MAX_TITLE:
        return cleaned
    return cleaned[: MAX_TITLE - 1].rstrip() + "…"


def list_conversations(search: str | None = None) -> list[dict]:
    return repository.list_conversations(search)


def get_conversation(conversation_id: int) -> dict:
    conversation = repository.get_conversation(conversation_id)
    if conversation is None:
        raise ConversationNotFoundError("Conversation not found.")
    return conversation


def get_conversation_detail(conversation_id: int) -> dict:
    conversation = get_conversation(conversation_id)
    conversation["messages"] = repository.list_messages(conversation_id)
    return conversation


def create_conversation(
    *,
    title: str | None,
    model: str,
    system_prompt: str = "",
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    conversation = repository.create_conversation(
        title=derive_title(title) if title else DEFAULT_TITLE,
        model=model,
        system_prompt=system_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    conversation["messages"] = []
    return conversation


def update_conversation(conversation_id: int, fields: dict) -> dict:
    get_conversation(conversation_id)
    updated = repository.update_conversation(conversation_id, fields)
    if updated is None:
        raise ConversationNotFoundError("Conversation not found.")
    return updated


def delete_conversation(conversation_id: int) -> None:
    if not repository.delete_conversation(conversation_id):
        raise ConversationNotFoundError("Conversation not found.")


def clear_messages(conversation_id: int) -> dict:
    get_conversation(conversation_id)
    repository.clear_messages(conversation_id)
    return get_conversation_detail(conversation_id)


def append_user_message(conversation_id: int, content: str, model: str | None) -> int:
    message_id = repository.add_message(
        conversation_id,
        role="user",
        content=content,
        model=model,
    )
    repository.set_title_if_default(conversation_id, derive_title(content))
    if model:
        repository.touch_conversation(conversation_id, model=model)
    return message_id


def touch(conversation_id: int, model: str | None = None) -> None:
    repository.touch_conversation(conversation_id, model=model)


def delete_message(conversation_id: int, message_id: int) -> None:
    get_conversation(conversation_id)
    if not repository.delete_message(conversation_id, message_id):
        raise ConversationNotFoundError("Message not found.")


def append_error_message(
    conversation_id: int,
    *,
    message: str,
    model: str | None = None,
    provider_name: str | None = None,
) -> None:
    repository.add_message(
        conversation_id,
        role="assistant",
        content="",
        status="error",
        model=model,
        provider_name=provider_name,
        error_message=message,
    )


def record_completion(
    conversation_id: int,
    *,
    info: dict,
    model: str,
    provider_model: str,
    provider_name: str,
) -> None:
    """Dipanggil gateway setelah stream selesai: satu-satunya tempat pesan
    asisten disimpan, memakai usage dari parser SSE. Tidak menulis
    request_logs, jadi tidak ada penghitungan ganda di analytics."""
    try:
        usage = info.get("usage")
        input_tokens = usage[0] if usage else None
        output_tokens = usage[1] if usage else None
        if usage is not None:
            cost_usd, cost_status = pricing_service.calculate_cost(
                provider_model, input_tokens, output_tokens
            )
        else:
            cost_usd, cost_status = None, "unknown"

        if info.get("cancelled"):
            status = "stopped"
        elif info.get("status", 200) >= 400 or info.get("error_code"):
            status = "error"
        elif not info.get("content"):
            status = "error"
        else:
            status = "complete"

        repository.add_message(
            conversation_id,
            role="assistant",
            content=info.get("content") or "",
            status=status,
            model=model,
            provider_name=provider_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            cost_status=cost_status,
            duration_ms=info.get("duration_ms"),
            error_message=info.get("error_code") if status == "error" else None,
        )
    except Exception:  # pragma: no cover - jangan sampai merusak stream
        logger.exception("Gagal menyimpan pesan asisten untuk conversation %s", conversation_id)
