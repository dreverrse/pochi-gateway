from pydantic import BaseModel, Field


class UsageBreakdown(BaseModel):
    name: str
    requests: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


class TimeseriesPoint(BaseModel):
    date: str
    requests: int
    successful_requests: int = 0
    input_tokens: int
    output_tokens: int
    cost_usd: float


class SummaryTotals(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int
    input_tokens: int
    output_tokens: int
    known_cost_usd: float
    estimated_cost_usd: float
    unknown_cost_requests: int
    avg_duration_ms: float


class Summary(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int
    input_tokens: int
    output_tokens: int
    known_cost_usd: float
    estimated_cost_usd: float
    unknown_cost_requests: int
    avg_duration_ms: float
    by_model: list[UsageBreakdown] = Field(default_factory=list)
    by_provider: list[UsageBreakdown] = Field(default_factory=list)
    by_key: list[UsageBreakdown] = Field(default_factory=list)
    timeseries: list[TimeseriesPoint] = Field(default_factory=list)
    previous: SummaryTotals | None = None
