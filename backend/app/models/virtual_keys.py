from typing import Literal

from pydantic import BaseModel, Field, field_validator

BudgetPeriod = Literal["daily", "monthly"]


def _clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Nama key wajib diisi")
    return value


def _clean_models(value: list[str]) -> list[str]:
    cleaned = []
    for item in value:
        item = item.strip()
        if not item:
            raise ValueError("Nama model tidak boleh kosong")
        if len(item) > 100:
            raise ValueError("Nama model terlalu panjang")
        if item not in cleaned:
            cleaned.append(item)
    if len(cleaned) > 50:
        raise ValueError("Maksimal 50 model per key")
    return cleaned


class VirtualKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    allowed_models: list[str] = Field(default_factory=list)
    budget_limit_usd: float | None = Field(default=None, ge=0, le=1_000_000)
    budget_period: BudgetPeriod = "monthly"
    rate_limit_rpm: int | None = Field(default=None, ge=0, le=1_000_000)
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("allowed_models")
    @classmethod
    def validate_models(cls, value: list[str]) -> list[str]:
        return _clean_models(value)


class VirtualKeyUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    allowed_models: list[str] | None = None
    budget_limit_usd: float | None = Field(default=None, ge=0, le=1_000_000)
    budget_period: BudgetPeriod | None = None
    rate_limit_rpm: int | None = Field(default=None, ge=0, le=1_000_000)
    enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_name(value)

    @field_validator("allowed_models")
    @classmethod
    def validate_models(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return _clean_models(value)


class VirtualKeyOut(BaseModel):
    id: int
    name: str
    key_prefix: str
    allowed_models: list[str]
    budget_limit_usd: float | None
    budget_period: BudgetPeriod
    rate_limit_rpm: int | None
    budget_spent_usd: float | None = None
    enabled: bool
    created_at: str
    last_used_at: str | None
    revoked_at: str | None


class VirtualKeyCreated(BaseModel):
    key: VirtualKeyOut
    token: str
