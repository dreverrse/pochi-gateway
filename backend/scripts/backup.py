import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402


def _mode_600(path: Path) -> None:
    if path.exists():
        path.chmod(0o600)


def _sqlite_backup(source: Path, destination: Path) -> None:
    with sqlite3.connect(source, timeout=10) as source_connection:
        with sqlite3.connect(destination) as destination_connection:
            source_connection.backup(destination_connection)


def _prune(output: Path, keep: int) -> None:
    if keep <= 0:
        return
    backups = sorted(
        (path for path in output.glob("pochi-backup-*") if path.is_dir()),
        key=lambda path: path.name,
        reverse=True,
    )
    for old in backups[keep:]:
        shutil.rmtree(old, ignore_errors=True)


def create_backup(output: Path, keep: int) -> Path:
    if not settings.db_path.exists():
        raise FileNotFoundError(f"Database tidak ditemukan: {settings.db_path}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = output / f"pochi-backup-{stamp}"
    destination.mkdir(parents=True, mode=0o700)
    destination.chmod(0o700)

    db_target = destination / "pochi.db"
    _sqlite_backup(settings.db_path, db_target)
    _mode_600(db_target)

    files = ["pochi.db"]
    for source, name in (
        (settings.secret_key_path, "secret.key"),
        (settings.admin_token_path, "admin_token"),
    ):
        if source.exists():
            target = destination / name
            shutil.copy2(source, target)
            _mode_600(target)
            files.append(name)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "app_version": settings.app_version,
        "database": str(settings.db_path),
        "files": files,
    }
    manifest_path = destination / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    _mode_600(manifest_path)

    _prune(output, keep)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup database dan kunci Pochi Gateway.")
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data" / "backups",
        help="Direktori tujuan backup.",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=7,
        help="Jumlah backup terbaru yang disimpan; 0 untuk menyimpan semua.",
    )
    args = parser.parse_args()

    try:
        destination = create_backup(args.output, args.keep)
    except (OSError, sqlite3.Error) as exc:
        print(f"Backup gagal: {exc}", file=sys.stderr)
        return 1

    print(f"Backup dibuat: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
