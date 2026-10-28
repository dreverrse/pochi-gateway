from pydantic import BaseModel, Field, field_validator, model_validator


def _clean_public_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Nama model wajib diisi")
    if any(character.isspace() for character in value):
        raise ValueError("Nama model tidak boleh mengandung spasi")
    return value


def _clean_provider_model(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Nama model provider wajib diisi")
    return value


class ModelCreate(BaseModel):
    public_name: str = Field(min_length=1, max_length=100)
    provider_id: int = Field(gt=0)
    provider_model: str = Field(min_length=1, max_length=200)
    enabled: bool = True
    input_usd_per_million: float | None = Field(default=None, ge=0, le=1_000_000)
    output_usd_per_million: float | None = Field(default=None, ge=0, le=1_000_000)

    @field_validator("public_name")
    @classmethod
    def validate_public_name(cls, value: str) -> str:
        return _clean_public_name(value)

    @field_validator("provider_model")
    @classmethod
    def validate_provider_model(cls, value: str) -> str:
        return _clean_provider_model(value)

    @model_validator(mode="after")
    def validate_price_pair(self):
        values = (self.input_usd_per_million, self.output_usd_per_million)
        if any(value is not None for value in values) and not all(
            value is not None for value in values
        ):
            raise ValueError("Harga input dan output harus diisi bersamaan")
        return self


class ModelUpdate(BaseModel):
    public_name: str | None = Field(default=None, max_length=100)
    provider_id: int | None = Field(default=None, gt=0)
    provider_model: str | None = Field(default=None, max_length=200)
    enabled: bool | None = None
    input_usd_per_million: float | None = Field(default=None, ge=0, le=1_000_000)
    output_usd_per_million: float | None = Field(default=None, ge=0, le=1_000_000)

    @field_validator("public_name")
    @classmethod
    def validate_public_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_public_name(value)

    @field_validator("provider_model")
    @classmethod
    def validate_provider_model(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_provider_model(value)

    @model_validator(mode="after")
    def validate_price_pair(self):
        values = (self.input_usd_per_million, self.output_usd_per_million)
        if any(value is not None for value in values) and not all(
            value is not None for value in values
        ):
            raise ValueError("Harga input dan output harus diisi bersamaan")
        return self


class ModelOut(BaseModel):
    id: int
    public_name: str
    provider_id: int
    provider_model: str
    provider_name: str
    enabled: bool
    input_usd_per_million: float | None = None
    output_usd_per_million: float | None = None
    price_updated_at: str | None = None
    created_at: str
    updated_at: str
