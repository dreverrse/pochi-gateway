import json
import secrets
import sqlite3

from app.core.security import hash_api_key
from app.db import gateway_repository, model_repository, virtual_key_repository
from app.models.virtual_keys import (
    VirtualKeyCreate,
    VirtualKeyCreated,
    VirtualKeyOut,
    VirtualKeyUpdate,
)


class VirtualKeyNotFoundError(Exception):
    pass


class VirtualKeyRevokedError(Exception):
    pass


class VirtualKeyModelError(Exception):
    pass


def _to_out(row: sqlite3.Row) -> VirtualKeyOut:
    try:
        allowed_models = json.loads(row["allowed_models"] or "[]")
    except (TypeError, ValueError):
        allowed_models = []
    if not isinstance(allowed_models, list):
        allowed_models = []

    return VirtualKeyOut(
        id=row["id"],
        name=row["name"],
        key_prefix=row["key_prefix"],
        allowed_models=[str(model) for model in allowed_models],
        budget_limit_usd=row["budget_limit_usd"],
        budget_period=row["budget_period"],
        rate_limit_rpm=row["rate_limit_rpm"],
        budget_spent_usd=gateway_repository.budget_spend(
            row["id"], row["budget_period"]
        ),
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
        last_used_at=row["last_used_at"],
        revoked_at=row["revoked_at"],
    )


def _generate_token() -> tuple[str, str, str]:
    token = f"pk_pochi_{secrets.token_urlsafe(32)}"
    return token, token[:20], hash_api_key(token)


def _validate_models(models: list[str]) -> None:
    if not models:
        return
    known = {row["public_name"] for row in model_repository.list_models()}
    unknown = [model for model in models if model not in known]
    if unknown:
        preview = ", ".join(unknown[:3])
        raise VirtualKeyModelError(f"Model tidak dikenal: {preview}")


def list_keys() -> list[VirtualKeyOut]:
    return [_to_out(row) for row in virtual_key_repository.list_keys()]


def create_key(payload: VirtualKeyCreate) -> VirtualKeyCreated:
    _validate_models(payload.allowed_models)
    token, prefix, token_hash = _generate_token()
    row = virtual_key_repository.create_key(
        name=payload.name,
        key_prefix=prefix,
        key_hash=token_hash,
        allowed_models=json.dumps(payload.allowed_models),
        budget_limit_usd=payload.budget_limit_usd,
        budget_period=payload.budget_period,
        enabled=payload.enabled,
        rate_limit_rpm=payload.rate_limit_rpm,
    )
    return VirtualKeyCreated(key=_to_out(row), token=token)


def update_key(key_id: int, payload: VirtualKeyUpdate) -> VirtualKeyOut:
    existing = virtual_key_repository.get_key(key_id)
    if existing is None:
        raise VirtualKeyNotFoundError(f"Key {key_id} tidak ditemukan")
    if existing["revoked_at"] is not None:
        raise VirtualKeyRevokedError("Key yang sudah dicabut tidak dapat diubah")

    fields: dict[str, object] = {}

    if "name" in payload.model_fields_set and payload.name is not None:
        fields["name"] = payload.name

    if "allowed_models" in payload.model_fields_set and payload.allowed_models is not None:
        _validate_models(payload.allowed_models)
        fields["allowed_models"] = json.dumps(payload.allowed_models)

    if "budget_limit_usd" in payload.model_fields_set:
        fields["budget_limit_usd"] = payload.budget_limit_usd

    if "budget_period" in payload.model_fields_set and payload.budget_period is not None:
        fields["budget_period"] = payload.budget_period

    if "rate_limit_rpm" in payload.model_fields_set:
        fields["rate_limit_rpm"] = payload.rate_limit_rpm

    if "enabled" in payload.model_fields_set and payload.enabled is not None:
        fields["enabled"] = int(payload.enabled)

    row = virtual_key_repository.update_key(key_id, fields)
    if row is None:
        raise VirtualKeyNotFoundError(f"Key {key_id} tidak ditemukan")
    return _to_out(row)


def revoke_key(key_id: int) -> VirtualKeyOut:
    if virtual_key_repository.get_key(key_id) is None:
        raise VirtualKeyNotFoundError(f"Key {key_id} tidak ditemukan")
    row = virtual_key_repository.revoke_key(key_id)
    if row is None:
        raise VirtualKeyNotFoundError(f"Key {key_id} tidak ditemukan")
    return _to_out(row)
