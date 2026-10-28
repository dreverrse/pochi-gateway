import sqlite3
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.db.database import get_connection
from app.models.entities import Summary, TimeseriesPoint, UsageBreakdown

BREAKDOWN_SQL = """
SELECT
    {label} AS name,
    COUNT(*) AS requests,
    COALESCE(SUM(input_tokens), 0) AS input_tokens,
    COALESCE(SUM(output_tokens), 0) AS output_tokens,
    COALESCE(SUM(CASE WHEN cost_status IN ('known', 'estimated') THEN cost_usd END), 0) AS cost_usd
FROM request_logs
{join}
WHERE date(request_logs.created_at) >= date('now', ?)
GROUP BY {label}
ORDER BY requests DESC
"""


def _round(value: float | None, digits: int = 6) -> float:
    return round(float(value or 0), digits)


def _to_breakdown(rows: list[sqlite3.Row]) -> list[UsageBreakdown]:
    return [
        UsageBreakdown(
            name=row["name"],
            requests=row["requests"],
            input_tokens=row["input_tokens"],
            output_tokens=row["output_tokens"],
            cost_usd=_round(row["cost_usd"]),
        )
        for row in rows
    ]


def _timeseries(connection: sqlite3.Connection, days: int) -> list[TimeseriesPoint]:
    rows = connection.execute(
        """
        SELECT
            date(created_at) AS date,
            COUNT(*) AS requests,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(CASE WHEN cost_status IN ('known', 'estimated') THEN cost_usd END), 0) AS cost_usd
        FROM request_logs
        WHERE date(created_at) >= date('now', ?)
        GROUP BY date(created_at)
        """,
        (f"-{days - 1} days",),
    ).fetchall()
    indexed = {row["date"]: row for row in rows}
    today = datetime.now(timezone.utc).date()
    points = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        key = day.isoformat()
        row = indexed.get(key)
        points.append(
            TimeseriesPoint(
                date=key,
                requests=row["requests"] if row else 0,
                input_tokens=row["input_tokens"] if row else 0,
                output_tokens=row["output_tokens"] if row else 0,
                cost_usd=_round(row["cost_usd"]) if row else 0.0,
            )
        )
    return points


def get_summary(days: int = 14, db_path=None) -> Summary:
    path = db_path or settings.db_path
    with get_connection(path) as connection:
        totals = connection.execute(
            """
            SELECT
                COUNT(*) AS total_requests,
                COALESCE(SUM(CASE WHEN status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END), 0) AS successful_requests,
                COALESCE(SUM(CASE WHEN status_code NOT BETWEEN 200 AND 299 THEN 1 ELSE 0 END), 0) AS failed_requests,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(CASE WHEN cost_status = 'known' THEN cost_usd END), 0) AS known_cost_usd,
                COALESCE(SUM(CASE WHEN cost_status = 'estimated' THEN cost_usd END), 0) AS estimated_cost_usd,
                COALESCE(SUM(CASE WHEN cost_status = 'unknown' THEN 1 ELSE 0 END), 0) AS unknown_cost_requests,
                COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
            FROM request_logs
            WHERE date(created_at) >= date('now', ?)
            """,
            (f"-{days - 1} days",),
        ).fetchone()

        window = (f"-{days - 1} days",)
        by_model = connection.execute(
            BREAKDOWN_SQL.format(label="public_model", join=""), window
        ).fetchall()
        by_provider = connection.execute(
            BREAKDOWN_SQL.format(
                label="COALESCE(providers.name, 'Unknown provider')",
                join="LEFT JOIN providers ON providers.id = request_logs.provider_id",
            ),
            window,
        ).fetchall()
        by_key = connection.execute(
            BREAKDOWN_SQL.format(
                label="COALESCE(virtual_keys.name, 'Unknown key')",
                join="LEFT JOIN virtual_keys ON virtual_keys.id = request_logs.virtual_key_id",
            ),
            window,
        ).fetchall()

        return Summary(
            total_requests=totals["total_requests"],
            successful_requests=totals["successful_requests"],
            failed_requests=totals["failed_requests"],
            input_tokens=totals["input_tokens"],
            output_tokens=totals["output_tokens"],
            known_cost_usd=_round(totals["known_cost_usd"]),
            estimated_cost_usd=_round(totals["estimated_cost_usd"]),
            unknown_cost_requests=totals["unknown_cost_requests"],
            avg_duration_ms=_round(totals["avg_duration_ms"], 1),
            by_model=_to_breakdown(by_model),
            by_provider=_to_breakdown(by_provider),
            by_key=_to_breakdown(by_key),
            timeseries=_timeseries(connection, days),
        )


def get_timeseries(days: int = 14, db_path=None) -> list[TimeseriesPoint]:
    path = db_path or settings.db_path
    with get_connection(path) as connection:
        return _timeseries(connection, days)


def ping(db_path=None) -> bool:
    path = db_path or settings.db_path
    with get_connection(path) as connection:
        return connection.execute("SELECT 1").fetchone()[0] == 1
