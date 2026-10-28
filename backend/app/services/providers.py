import sqlite3
import time

import httpx

from app.core.config import settings
from app.core.security import SecretBoxError, get_secret_box
from app.db import provider_repository
from app.models.providers import (
    ProviderCreate,
    ProviderOut,
    ProviderTestResult,
    ProviderUpdate,
)


class ProviderNotFoundError(Exception):
    pass


class ProviderNameConflictError(Exception):
    pass


class ProviderSecretError(Exception):
    pass


def _to_out(row: sqlite3.Row) -> ProviderOut:
    return ProviderOut(
        id=row["id"],
        name=row["name"],
        base_url=row["base_url"],
        adapter_type=row["adapter_type"],
        enabled=bool(row["enabled"]),
        has_secret=bool(row["has_secret"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _encrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return get_secret_box().encrypt(value)
    except SecretBoxError as exc:
        raise ProviderSecretError("Gagal menyimpan API key terenkripsi") from exc


def _conflict(exc: sqlite3.IntegrityError, name: str) -> ProviderNameConflictError | None:
    if "providers.name" in str(exc):
        return ProviderNameConflictError(f"Provider dengan nama '{name}' sudah ada")
    return None


def list_providers() -> list[ProviderOut]:
    return [_to_out(row) for row in provider_repository.list_providers()]


def create_provider(payload: ProviderCreate) -> ProviderOut:
    ciphertext = _encrypt(payload.api_key)
    try:
        row = provider_repository.create_provider(
            name=payload.name,
            base_url=payload.base_url,
            adapter_type=payload.adapter_type,
            enabled=payload.enabled,
            ciphertext=ciphertext,
        )
    except sqlite3.IntegrityError as exc:
        conflict = _conflict(exc, payload.name)
        if conflict:
            raise conflict from exc
        raise
    return _to_out(row)


def update_provider(provider_id: int, payload: ProviderUpdate) -> ProviderOut:
    if provider_repository.get_provider(provider_id) is None:
        raise ProviderNotFoundError(f"Provider {provider_id} tidak ditemukan")

    fields: dict[str, object] = {}
    for field in ("name", "base_url", "adapter_type", "enabled"):
        if field in payload.model_fields_set:
            value = getattr(payload, field)
            if value is not None:
                fields[field] = int(value) if field == "enabled" else value

    ciphertext = _encrypt(payload.api_key)
    try:
        row = provider_repository.update_provider(provider_id, fields, ciphertext)
    except sqlite3.IntegrityError as exc:
        name = fields.get("name", "")
        conflict = _conflict(exc, str(name))
        if conflict:
            raise conflict from exc
        raise

    if row is None:
        raise ProviderNotFoundError(f"Provider {provider_id} tidak ditemukan")
    return _to_out(row)


def _extract_error(response: httpx.Response) -> str:
    message = ""
    try:
        body = response.json()
        if isinstance(body, dict):
            error = body.get("error")
            if isinstance(error, dict):
                message = str(error.get("message") or "")
            elif isinstance(error, str):
                message = error
            if not message:
                message = str(body.get("message") or body.get("detail") or "")
    except ValueError:
        pass

    if not message:
        message = response.reason_phrase or f"HTTP {response.status_code}"
    message = " ".join(message.split())[:240]
    return f"Provider menolak koneksi ({response.status_code}): {message}"


def test_provider(provider_id: int) -> ProviderTestResult:
    provider = provider_repository.get_provider(provider_id)
    if provider is None:
        raise ProviderNotFoundError(f"Provider {provider_id} tidak ditemukan")

    secret = provider_repository.get_provider_secret(provider_id)
    if secret is None:
        return ProviderTestResult(
            ok=False,
            message="API key belum disimpan. Edit provider untuk menambahkan key.",
        )

    try:
        api_key = get_secret_box().decrypt(secret["ciphertext"])
    except SecretBoxError:
        return ProviderTestResult(
            ok=False,
            message="Secret provider tidak dapat didekripsi. Periksa file kunci enkripsi.",
        )

    url = f"{provider['base_url']}/models"
    timeout = settings.provider_timeout_seconds
    started = time.perf_counter()

    try:
        with httpx.Client(
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            response = client.get(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                    "User-Agent": f"{settings.app_name}/{settings.app_version}",
                },
            )
    except httpx.TimeoutException:
        return ProviderTestResult(
            ok=False,
            message=f"Timeout setelah {timeout:g} detik.",
        )
    except httpx.HTTPError as exc:
        return ProviderTestResult(
            ok=False,
            message=f"Koneksi gagal: {type(exc).__name__}.",
        )
    except Exception:
        return ProviderTestResult(
            ok=False,
            message="Koneksi gagal karena kesalahan yang tidak terduga.",
        )

    latency_ms = int((time.perf_counter() - started) * 1000)

    if 200 <= response.status_code < 300:
        models_count = None
        try:
            body = response.json()
            data = body.get("data") if isinstance(body, dict) else None
            if isinstance(data, list):
                models_count = len(data)
        except ValueError:
            pass
        return ProviderTestResult(
            ok=True,
            message="Koneksi berhasil.",
            status_code=response.status_code,
            latency_ms=latency_ms,
            models_count=models_count,
        )

    return ProviderTestResult(
        ok=False,
        message=_extract_error(response),
        status_code=response.status_code,
        latency_ms=latency_ms,
    )
