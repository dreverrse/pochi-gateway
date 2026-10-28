from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

AdapterType = Literal["openai_compatible", "inception"]


def _clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Nama provider wajib diisi")
    return value


def _clean_base_url(value: str) -> str:
    value = value.strip()
    if any(character.isspace() for character in value):
        raise ValueError("Base URL tidak boleh mengandung spasi")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Base URL harus menggunakan http atau https")
    if not parsed.netloc or not parsed.hostname:
        raise ValueError("Base URL tidak valid")
    if parsed.username or parsed.password:
        raise ValueError("Base URL tidak boleh mengandung kredensial")
    if parsed.query or parsed.fragment:
        raise ValueError("Base URL tidak boleh mengandung query atau fragment")
    return value.rstrip("/")


def _clean_api_key(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class ProviderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    base_url: str = Field(min_length=1, max_length=500)
    adapter_type: AdapterType = "openai_compatible"
    enabled: bool = True
    api_key: str | None = Field(default=None, max_length=4096)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        return _clean_base_url(value)

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: str | None) -> str | None:
        return _clean_api_key(value)


class ProviderUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    base_url: str | None = Field(default=None, max_length=500)
    adapter_type: AdapterType | None = None
    enabled: bool | None = None
    api_key: str | None = Field(default=None, max_length=4096)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_name(value)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_base_url(value)

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: str | None) -> str | None:
        return _clean_api_key(value)


class ProviderOut(BaseModel):
    id: int
    name: str
    base_url: str
    adapter_type: AdapterType
    enabled: bool
    has_secret: bool
    created_at: str
    updated_at: str


class ProviderTestResult(BaseModel):
    ok: bool
    message: str
    status_code: int | None = None
    latency_ms: int | None = None
    models_count: int | None = None
