from typing import Any

from app.core.config import settings


class ProviderAdapter:
    name = "openai_compatible"

    def chat_completions_url(self, base_url: str) -> str:
        return f"{base_url.rstrip('/')}/chat/completions"

    def headers(self, api_key: str, stream: bool) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json",
            "User-Agent": f"{settings.app_name}/{settings.app_version}",
        }

    def prepare_body(self, body: dict[str, Any]) -> dict[str, Any]:
        return body


class InceptionAdapter(ProviderAdapter):
    name = "inception"


ADAPTERS: dict[str, ProviderAdapter] = {
    "openai_compatible": ProviderAdapter(),
    "inception": InceptionAdapter(),
}


def get_adapter(adapter_type: str) -> ProviderAdapter:
    return ADAPTERS.get(adapter_type, ADAPTERS["openai_compatible"])
