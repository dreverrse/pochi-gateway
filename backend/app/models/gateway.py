from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str = Field(min_length=1, max_length=200)
    messages: list[dict[str, Any]] = Field(min_length=1, max_length=500)
    stream: bool = False


class DashboardChatRequest(ChatCompletionRequest):
    """Chat dari dashboard. Selain pesan, boleh membawa konteks conversation
    supaya server yang menyimpan riwayat dan usage-nya."""

    conversation_id: int | None = Field(default=None, ge=1)
    user_message: str | None = Field(default=None, max_length=200_000)
    stream: bool = True
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=32_000)
