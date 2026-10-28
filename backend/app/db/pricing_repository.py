import sqlite3
from datetime import datetime, timezone

from app.core.config import settings
from app.db.database import get_connection

PRICE_COLUMNS = """
    provider_model,
    input_usd_per_million,
    output_usd_per_million,
    effective_from,
    effective_until,
    source,
    updated_at
"""


def _timestamp(value: datetime | None = None) -> str:
    moment = value or datetime.now(timezone.utc)
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def get_effective_price(
    provider_model: str,
    at: datetime | None = None,
) -> sqlite3.Row | None:
    stamp = _timestamp(at)
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"""
            SELECT {PRICE_COLUMNS}
            FROM model_prices
            WHERE provider_model = ?
              AND effective_from <= ?
              AND (effective_until IS NULL OR effective_until > ?)
            ORDER BY effective_from DESC, id DESC
            LIMIT 1
            """,
            (provider_model, stamp, stamp),
        ).fetchone()


def get_effective_prices(
    provider_models: tuple[str, ...],
    at: datetime | None = None,
) -> dict[str, sqlite3.Row]:
    if not provider_models:
        return {}

    stamp = _timestamp(at)
    placeholders = ", ".join("?" for _ in provider_models)
    with get_connection(settings.db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT {PRICE_COLUMNS}
            FROM (
                SELECT
                    {PRICE_COLUMNS},
                    ROW_NUMBER() OVER (
                        PARTITION BY provider_model
                        ORDER BY effective_from DESC, id DESC
                    ) AS rank
                FROM model_prices
                WHERE provider_model IN ({placeholders})
                  AND effective_from <= ?
                  AND (effective_until IS NULL OR effective_until > ?)
            )
            WHERE rank = 1
            """,
            (*provider_models, stamp, stamp),
        ).fetchall()
    return {row["provider_model"]: row for row in rows}


def get_price_history(provider_model: str) -> list[sqlite3.Row]:
    """Riwayat perubahan harga untuk satu provider_model (terbaru dulu)."""
    with get_connection(settings.db_path) as connection:
        return connection.execute(
            f"""
            SELECT
                id,
                {PRICE_COLUMNS}
            FROM model_prices
            WHERE provider_model = ?
            ORDER BY effective_from DESC, id DESC
            """,
            (provider_model,),
        ).fetchall()
