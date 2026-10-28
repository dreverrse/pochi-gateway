from pydantic import BaseModel, Field

from app.models.entities import TimeseriesPoint, UsageBreakdown


class ProviderUsageOut(BaseModel):
    provider_id: int
    name: str
    requests: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    unknown_cost_requests: int
    successful_requests: int
    models_count: int
    last_request_at: str | None = None


class AnalyticsOut(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    success_rate: float
    known_cost_usd: float
    estimated_cost_usd: float
    unknown_cost_requests: int
    avg_duration_ms: float
    p50_duration_ms: float
    p95_duration_ms: float
    timeseries: list[TimeseriesPoint] = Field(default_factory=list)
    by_provider: list[UsageBreakdown] = Field(default_factory=list)
    by_model: list[UsageBreakdown] = Field(default_factory=list)
    by_key: list[UsageBreakdown] = Field(default_factory=list)
