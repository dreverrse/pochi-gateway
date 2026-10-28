from pydantic import BaseModel, Field


class UsageLogOut(BaseModel):
    id: int
    request_id: str
    key_name: str | None
    provider_name: str | None
    public_model: str
    provider_model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    cost_status: str
    status_code: int
    duration_ms: int
    streamed: bool
    error_code: str | None
    created_at: str


class UsageLogsPage(BaseModel):
    items: list[UsageLogOut] = Field(default_factory=list)
    total: int
    page: int
    page_size: int
    total_pages: int
