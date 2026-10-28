PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    adapter_type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_secrets (
    provider_id INTEGER PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS virtual_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL UNIQUE,
    key_hash TEXT NOT NULL UNIQUE,
    allowed_models TEXT NOT NULL DEFAULT '[]',
    budget_limit_usd REAL,
    budget_period TEXT NOT NULL DEFAULT 'monthly',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_name TEXT NOT NULL UNIQUE,
    provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    provider_model TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_model TEXT NOT NULL,
    input_usd_per_million REAL NOT NULL,
    output_usd_per_million REAL NOT NULL,
    cached_input_usd_per_million REAL,
    effective_from TEXT NOT NULL,
    effective_until TEXT,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    virtual_key_id INTEGER REFERENCES virtual_keys(id) ON DELETE SET NULL,
    provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
    public_model TEXT NOT NULL,
    provider_model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL,
    cost_status TEXT NOT NULL DEFAULT 'unknown' CHECK (cost_status IN ('known', 'estimated', 'unknown')),
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    streamed INTEGER NOT NULL DEFAULT 0 CHECK (streamed IN (0, 1)),
    error_code TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS rate_limit_windows (
    virtual_key_id INTEGER NOT NULL REFERENCES virtual_keys(id) ON DELETE CASCADE,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (virtual_key_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_start ON rate_limit_windows(window_start);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(public_model);
CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_virtual_key ON request_logs(virtual_key_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_model_prices_lookup ON model_prices(provider_model, effective_from);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_prefix ON virtual_keys(key_prefix);
