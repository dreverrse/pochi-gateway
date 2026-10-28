import hashlib
import json
import random
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

DEMO_PROVIDERS = [
    ("OpenAI Compatible (Demo)", "https://api.example.invalid/v1", "openai_compatible"),
    ("Inception Labs (Demo)", "https://api.inception.example.invalid/v1", "inception"),
]

DEMO_MODELS = [
    ("pochi-chat", 1, "gpt-4o-mini", 0.15, 0.60),
    ("pochi-fast", 2, "mercury-2", 0.25, 1.00),
    ("pochi-reason", 1, "o3-mini", 1.10, 4.40),
]

DEMO_KEYS = [
    ("Pochi Android", "pk_pochi_demo1", "pochi-demo-key-android", 20.0, ["pochi-chat", "pochi-fast"]),
    ("Hermes Agent", "pk_pochi_demo2", "pochi-demo-key-hermes", 50.0, ["pochi-chat", "pochi-reason"]),
]


def _timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _hash_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def seed_demo_data(connection: sqlite3.Connection) -> None:
    existing = connection.execute("SELECT COUNT(*) FROM providers").fetchone()[0]
    if existing:
        return

    now = datetime.now(timezone.utc)
    stamp = _timestamp(now)

    connection.executemany(
        "INSERT INTO providers (name, base_url, adapter_type, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
        [(name, url, adapter, stamp, stamp) for name, url, adapter in DEMO_PROVIDERS],
    )

    connection.executemany(
        "INSERT INTO models (public_name, provider_id, provider_model, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
        [(public, provider_id, provider_model, stamp, stamp) for public, provider_id, provider_model, _, _ in DEMO_MODELS],
    )

    connection.executemany(
        "INSERT INTO model_prices (provider_model, input_usd_per_million, output_usd_per_million, effective_from, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (provider_model, input_rate, output_rate, stamp, "demo-seed", stamp)
            for _, _, provider_model, input_rate, output_rate in DEMO_MODELS
        ],
    )

    connection.executemany(
        "INSERT INTO virtual_keys (name, key_prefix, key_hash, allowed_models, budget_limit_usd, budget_period, enabled, created_at) VALUES (?, ?, ?, ?, ?, 'monthly', 1, ?)",
        [
            (name, prefix, _hash_key(secret), json.dumps(models), budget, stamp)
            for name, prefix, secret, budget, models in DEMO_KEYS
        ],
    )

    rng = random.Random(42)
    rates = {provider_model: (input_rate, output_rate) for _, _, provider_model, input_rate, output_rate in DEMO_MODELS}
    model_rows = [(name, provider_id, provider_model) for name, provider_id, provider_model, _, _ in DEMO_MODELS]
    weights = [0.55, 0.30, 0.15]
    statuses = [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429, 500]
    logs = []
    last_used: dict[int, str] = {}

    for day_offset in range(13, -1, -1):
        day = now.date() - timedelta(days=day_offset)
        max_hour = now.hour if day_offset == 0 else 23
        if max_hour < 0:
            continue
        for _ in range(rng.randint(6, 28)):
            public_model, provider_id, provider_model = rng.choices(model_rows, weights=weights, k=1)[0]
            status_code = rng.choice(statuses)
            streamed = 1 if rng.random() < 0.25 else 0
            created = datetime(
                day.year,
                day.month,
                day.day,
                rng.randint(0, max_hour) if max_hour > 0 else 0,
                rng.randint(0, 59),
                rng.randint(0, 59),
                tzinfo=timezone.utc,
            )
            duration_ms = rng.randint(420, 6800)
            finished = created + timedelta(milliseconds=duration_ms)

            if 200 <= status_code < 300:
                input_tokens = rng.randint(180, 2600)
                output_tokens = rng.randint(80, 1500)
                roll = rng.random()
                if roll < 0.82:
                    cost_status = "known"
                elif roll < 0.94:
                    cost_status = "estimated"
                else:
                    cost_status = "unknown"
                input_rate, output_rate = rates[provider_model]
                cost = (input_tokens / 1_000_000) * input_rate + (output_tokens / 1_000_000) * output_rate
                cost_usd = None if cost_status == "unknown" else round(cost, 8)
                error_code = None
            else:
                input_tokens = 0
                output_tokens = 0
                cost_usd = 0.0
                cost_status = "known"
                error_code = {400: "bad_request", 429: "rate_limited", 500: "provider_error"}[status_code]

            key_id = 1 if rng.random() < 0.68 else 2
            created_at = _timestamp(created)
            last_used[key_id] = max(last_used.get(key_id, ""), created_at)
            logs.append(
                (
                    str(uuid.uuid4()),
                    key_id,
                    provider_id,
                    public_model,
                    provider_model,
                    input_tokens,
                    output_tokens,
                    cost_usd,
                    cost_status,
                    status_code,
                    duration_ms,
                    streamed,
                    error_code,
                    created_at,
                    _timestamp(finished),
                )
            )

    connection.executemany(
        """
        INSERT INTO request_logs (
            request_id, virtual_key_id, provider_id, public_model, provider_model,
            input_tokens, output_tokens, cost_usd, cost_status, status_code,
            duration_ms, streamed, error_code, created_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        logs,
    )

    for key_id, value in last_used.items():
        connection.execute("UPDATE virtual_keys SET last_used_at = ? WHERE id = ?", (value, key_id))
