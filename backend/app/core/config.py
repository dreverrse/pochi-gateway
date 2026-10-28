from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = PROJECT_ROOT / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="POCHI_",
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Pochi Gateway"
    app_version: str = "0.8.0"
    db_path: Path = PROJECT_ROOT / "data" / "pochi.db"
    seed_demo: bool = True
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    admin_token: str = ""
    admin_token_path: Path = PROJECT_ROOT / "data" / "admin_token"
    secret_key_path: Path = PROJECT_ROOT / "data" / "secret.key"
    allow_private_provider_urls: bool = True
    provider_timeout_seconds: float = 8.0
    gateway_timeout_seconds: float = 120.0
    gateway_connect_timeout_seconds: float = 10.0
    gateway_rate_limit_rpm: int = 60
    workflow_scheduler_enabled: bool = True


settings = Settings()
