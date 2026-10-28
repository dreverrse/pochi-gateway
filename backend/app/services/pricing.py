from datetime import datetime

from app.db import pricing_repository


def calculate_cost(
    provider_model: str,
    input_tokens: int,
    output_tokens: int,
    at: datetime | None = None,
) -> tuple[float | None, str]:
    price = pricing_repository.get_effective_price(provider_model, at)
    if price is None:
        return None, "unknown"

    cost = (
        (max(input_tokens, 0) / 1_000_000) * price["input_usd_per_million"]
        + (max(output_tokens, 0) / 1_000_000) * price["output_usd_per_million"]
    )
    return round(cost, 8), "known"
