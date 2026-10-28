import sqlite3

from app.db import model_repository, pricing_repository, provider_repository
from app.models.catalog import ModelCreate, ModelOut, ModelUpdate


class ModelNotFoundError(Exception):
    pass


class ModelNameConflictError(Exception):
    pass


class ModelProviderNotFoundError(Exception):
    pass


def _to_out(row: sqlite3.Row, price: sqlite3.Row | None = None) -> ModelOut:
    return ModelOut(
        id=row["id"],
        public_name=row["public_name"],
        provider_id=row["provider_id"],
        provider_model=row["provider_model"],
        provider_name=row["provider_name"],
        enabled=bool(row["enabled"]),
        input_usd_per_million=price["input_usd_per_million"] if price else None,
        output_usd_per_million=price["output_usd_per_million"] if price else None,
        price_updated_at=price["updated_at"] if price else None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _conflict(exc: sqlite3.IntegrityError, name: str) -> ModelNameConflictError | None:
    if "models.public_name" in str(exc):
        return ModelNameConflictError(f"Model dengan nama '{name}' sudah ada")
    return None


def _require_provider(provider_id: int) -> None:
    if provider_repository.get_provider(provider_id) is None:
        raise ModelProviderNotFoundError(f"Provider {provider_id} tidak ditemukan")


def list_models() -> list[ModelOut]:
    rows = model_repository.list_models()
    prices = pricing_repository.get_effective_prices(
        tuple({row["provider_model"] for row in rows})
    )
    return [_to_out(row, prices.get(row["provider_model"])) for row in rows]


def create_model(payload: ModelCreate) -> ModelOut:
    _require_provider(payload.provider_id)
    try:
        row = model_repository.create_model(
            public_name=payload.public_name,
            provider_id=payload.provider_id,
            provider_model=payload.provider_model,
            enabled=payload.enabled,
            input_usd_per_million=payload.input_usd_per_million,
            output_usd_per_million=payload.output_usd_per_million,
        )
    except sqlite3.IntegrityError as exc:
        conflict = _conflict(exc, payload.public_name)
        if conflict:
            raise conflict from exc
        raise
    price = pricing_repository.get_effective_price(row["provider_model"])
    return _to_out(row, price)


def update_model(model_id: int, payload: ModelUpdate) -> ModelOut:
    if model_repository.get_model(model_id) is None:
        raise ModelNotFoundError(f"Model {model_id} tidak ditemukan")

    fields: dict[str, object] = {}
    if "public_name" in payload.model_fields_set and payload.public_name is not None:
        fields["public_name"] = payload.public_name
    if "provider_id" in payload.model_fields_set and payload.provider_id is not None:
        _require_provider(payload.provider_id)
        fields["provider_id"] = payload.provider_id
    if "provider_model" in payload.model_fields_set and payload.provider_model is not None:
        fields["provider_model"] = payload.provider_model
    if "enabled" in payload.model_fields_set and payload.enabled is not None:
        fields["enabled"] = int(payload.enabled)

    try:
        row = model_repository.update_model(
            model_id,
            fields,
            input_usd_per_million=payload.input_usd_per_million,
            output_usd_per_million=payload.output_usd_per_million,
        )
    except sqlite3.IntegrityError as exc:
        name = fields.get("public_name", "")
        conflict = _conflict(exc, str(name))
        if conflict:
            raise conflict from exc
        raise

    if row is None:
        raise ModelNotFoundError(f"Model {model_id} tidak ditemukan")
    price = pricing_repository.get_effective_price(row["provider_model"])
    return _to_out(row, price)
