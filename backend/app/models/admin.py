from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)

    @field_validator("token")
    @classmethod
    def strip_token(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Admin token wajib diisi")
        return value


class LoginResponse(BaseModel):
    ok: bool
