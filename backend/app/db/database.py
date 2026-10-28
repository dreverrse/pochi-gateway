import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.core.config import Settings

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


@contextmanager
def get_connection(db_path: Path) -> Iterator[sqlite3.Connection]:
    connection = connect(db_path)
    try:
        yield connection
    finally:
        connection.close()


def _migrate(connection: sqlite3.Connection) -> None:
    """Migrasi idempoten untuk DB lama. CREATE TABLE IF NOT EXISTS tidak
    mengubah tabel yang sudah ada, jadi kolom baru ditambah manual."""
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(virtual_keys)")
    }
    if "rate_limit_rpm" not in columns:
        connection.execute(
            "ALTER TABLE virtual_keys ADD COLUMN rate_limit_rpm INTEGER"
        )


def init_db(settings: Settings) -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with get_connection(settings.db_path) as connection:
        connection.executescript(schema)
        _migrate(connection)
        connection.commit()
        if settings.seed_demo:
            from app.db.seed import seed_demo_data

            seed_demo_data(connection)
            connection.commit()
