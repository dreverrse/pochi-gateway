from pydantic import BaseModel


class SettingsOut(BaseModel):
    """Konfigurasi runtime yang aman ditampilkan. Tidak ada secret atau path file."""

    app_name: str
    app_version: str
    rate_limit_rpm: int
    provider_timeout_seconds: float
    gateway_timeout_seconds: float
    gateway_connect_timeout_seconds: float
    allow_private_provider_urls: bool
    cors_origins: list[str]
