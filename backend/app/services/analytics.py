import sqlite3

from app.db import analytics_repository
from app.db.time_window import Window
from app.models.analytics import AnalyticsOut, ProviderUsageOut
from app.models.entities import TimeseriesPoint, UsageBreakdown


def _round(value: float | None, digits: int = 6) -> float:
    return round(float(value or 0), digits)


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return round(ordered[index], 1)


def _breakdown(rows: list[sqlite3.Row]) -> list[UsageBreakdown]:
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


def get_analytics(
    days: int | None,
    hours: int | None,
    status: str,
    provider_id: int | None,
    model: str | None,
    key_id: int | None,
) -> AnalyticsOut:
    window = Window.build(days=days, hours=hours)
    model = model.strip() if model else None

    totals = analytics_repository.get_totals(window, status, provider_id, model, key_id)
    durations = analytics_repository.get_durations(window, status, provider_id, model, key_id)
    buckets = analytics_repository.get_timeseries(window, status, provider_id, model, key_id)

    timeseries = []
    for label in window.bucket_labels():
        row = buckets.get(label)
        timeseries.append(
            TimeseriesPoint(
                date=label,
                requests=row["requests"] if row else 0,
                successful_requests=row["successful_requests"] if row else 0,
                input_tokens=row["input_tokens"] if row else 0,
                output_tokens=row["output_tokens"] if row else 0,
                cost_usd=_round(row["cost_usd"]) if row else 0.0,
            )
        )

    total_requests = int(totals["total_requests"] or 0)
    successful = int(totals["successful_requests"] or 0)

    return AnalyticsOut(
        total_requests=total_requests,
        successful_requests=successful,
        failed_requests=int(totals["failed_requests"] or 0),
        input_tokens=int(totals["input_tokens"] or 0),
        output_tokens=int(totals["output_tokens"] or 0),
        total_tokens=int(totals["input_tokens"] or 0) + int(totals["output_tokens"] or 0),
        success_rate=round(successful / total_requests * 100, 1) if total_requests else 0.0,
        known_cost_usd=_round(totals["known_cost_usd"]),
        estimated_cost_usd=_round(totals["estimated_cost_usd"]),
        unknown_cost_requests=int(totals["unknown_cost_requests"] or 0),
        avg_duration_ms=round(float(totals["avg_duration_ms"] or 0), 1),
        p50_duration_ms=_percentile(durations, 0.5),
        p95_duration_ms=_percentile(durations, 0.95),
        timeseries=timeseries,
        by_provider=_breakdown(
            analytics_repository.get_breakdown(window, status, provider_id, model, key_id, "provider")
        ),
        by_model=_breakdown(
            analytics_repository.get_breakdown(window, status, provider_id, model, key_id, "model")
        ),
        by_key=_breakdown(
            analytics_repository.get_breakdown(window, status, provider_id, model, key_id, "key")
        ),
    )


def list_provider_usage(days: int | None, hours: int | None) -> list[ProviderUsageOut]:
    window = Window.build(days=days, hours=hours)
    return [
        ProviderUsageOut(
            provider_id=row["provider_id"],
            name=row["name"],
            requests=row["requests"],
            input_tokens=row["input_tokens"],
            output_tokens=row["output_tokens"],
            cost_usd=_round(row["cost_usd"]),
            unknown_cost_requests=row["unknown_cost_requests"],
            successful_requests=row["successful_requests"],
            models_count=row["models_count"],
            last_request_at=row["last_request_at"],
        )
        for row in analytics_repository.list_provider_usage(window)
    ]
