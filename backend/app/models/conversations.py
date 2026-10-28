from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    model: str = Field(default="", max_length=200)
    system_prompt: str = Field(default="", max_length=8000)
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=32000)


class ConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    model: str | None = Field(default=None, max_length=200)
    system_prompt: str | None = Field(default=None, max_length=8000)
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=32000)
    pinned: bool | None = None


class ConversationMessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    status: str
    model: str | None = None
    provider_name: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None
    cost_status: str | None = None
    duration_ms: int | None = None
    error_message: str | None = None
    created_at: str


class ConversationOut(BaseModel):
    id: int
    title: str
    model: str
    system_prompt: str
    temperature: float | None = None
    max_tokens: int | None = None
    pinned: bool = False
    message_count: int = 0
    preview: str | None = None
    created_at: str
    updated_at: str


class ConversationDetail(ConversationOut):
    messages: list[ConversationMessageOut] = Field(default_factory=list)


class ConversationListOut(BaseModel):
    items: list[ConversationOut]
