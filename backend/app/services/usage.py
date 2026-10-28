import csv
import io
import json
import sqlite3

from app.db import usage_repository
from app.models.usage import UsageLogOut, UsageLogsPage


def _to_out(row: sqlite3.Row) -> UsageLogOut:
    return UsageLogOut(
        id=row["id"],
        request_id=row["request_id"],
        key_name=row["key_name"],
        provider_name=row["provider_name"],
        public_model=row["public_model"],
        provider_model=row["provider_model"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        cost_usd=row["cost_usd"],
        cost_status=row["cost_status"],
        status_code=row["status_code"],
        duration_ms=row["duration_ms"],
        streamed=bool(row["streamed"]),
        error_code=row["error_code"],
        created_at=row["created_at"],
    )


def list_logs(
    days: int,
    status: str,
    model: str | None,
    key_id: int | None,
    page: int,
    page_size: int,
) -> UsageLogsPage:
    rows, total = usage_repository.list_request_logs(
        days=days,
        status=status,
        model=model.strip() if model else None,
        key_id=key_id,
        page=page,
        page_size=page_size,
    )
    total_pages = max(1, (total + page_size - 1) // page_size)
    return UsageLogsPage(
        items=[_to_out(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


CSV_HEADERS = [
    "id",
    "request_id",
    "key_name",
    "provider_name",
    "public_model",
    "provider_model",
    "input_tokens",
    "output_tokens",
    "cost_usd",
    "cost_status",
    "status_code",
    "duration_ms",
    "streamed",
    "error_code",
    "created_at",
]


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "request_id": row["request_id"],
        "key_name": row["key_name"],
        "provider_name": row["provider_name"],
        "public_model": row["public_model"],
        "provider_model": row["provider_model"],
        "input_tokens": row["input_tokens"],
        "output_tokens": row["output_tokens"],
        "cost_usd": row["cost_usd"],
        "cost_status": row["cost_status"],
        "status_code": row["status_code"],
        "duration_ms": row["duration_ms"],
        "streamed": bool(row["streamed"]),
        "error_code": row["error_code"],
        "created_at": row["created_at"],
    }


def export_logs(
    format: str,
    days: int,
    status: str,
    model: str | None,
    key_id: int | None,
) -> tuple[str, str, bytes]:
    rows = usage_repository.list_request_logs_all(
        days=days,
        status=status,
        model=model.strip() if model else None,
        key_id=key_id,
    )
    if format == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=CSV_HEADERS)
        writer.writeheader()
        for row in rows:
            writer.writerow(_row_to_dict(row))
        return "usage-logs.csv", "text/csv; charset=utf-8", buf.getvalue().encode("utf-8")
    payload = json.dumps(
        [_row_to_dict(row) for row in rows], ensure_ascii=False, indent=2
    ).encode("utf-8")
    return "usage-logs.json", "application/json", payload
