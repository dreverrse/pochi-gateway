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
    rate_limit_rpm INTEGER,
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
    supports_streaming INTEGER NOT NULL DEFAULT 0 CHECK (supports_streaming IN (0, 1)),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
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

CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    definition TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    webhook_token TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
    trigger TEXT NOT NULL,
    input TEXT,
    output TEXT,
    error TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS workflow_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
    output TEXT,
    error TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, started_at);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps(run_id);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    temperature REAL,
    max_tokens INTEGER,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'complete'
        CHECK (status IN ('complete', 'streaming', 'error', 'stopped')),
    model TEXT,
    provider_name TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd REAL,
    cost_status TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
    ON conversation_messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);
