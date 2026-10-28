"""Jendela waktu untuk query analitik.

Dua mode: `days` (harian, inklusif hari ini) dan `hours` (rolling window per
jam) supaya filter 24H di dashboard berarti 24 jam terakhir, bukan "hari ini".
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

DEFAULT_DAYS = 14
MAX_DAYS = 90
MAX_HOURS = 24 * MAX_DAYS


@dataclass(frozen=True)
class Window:
    days: int | None = None
    hours: int | None = None

    @classmethod
    def build(cls, days: int | None = None, hours: int | None = None) -> "Window":
        if hours:
            return cls(hours=max(1, min(int(hours), MAX_HOURS)))
        return cls(days=max(1, min(int(days or DEFAULT_DAYS), MAX_DAYS)))

    @property
    def hourly(self) -> bool:
        return self.hours is not None

    def clause(self, column: str = "created_at") -> tuple[str, list[object]]:
        if self.hours:
            return f"{column} >= datetime('now', ?)", [f"-{self.hours} hours"]
        days = self.days or DEFAULT_DAYS
        return f"date({column}) >= date('now', ?)", [f"-{days - 1} days"]

    def previous_clause(self, column: str = "created_at") -> tuple[str, list[object]]:
        """Window tepat sebelum window aktif, untuk perbandingan periode."""
        if self.hours:
            hours = self.hours
            return (
                f"{column} >= datetime('now', ?) AND {column} < datetime('now', ?)",
                [f"-{hours * 2} hours", f"-{hours} hours"],
            )
        days = self.days or DEFAULT_DAYS
        return (
            f"date({column}) >= date('now', ?) AND date({column}) < date('now', ?)",
            [f"-{days * 2 - 1} days", f"-{days - 1} days"],
        )

    def bucket_expression(self, column: str = "created_at") -> str:
        if self.hours:
            return f"strftime('%Y-%m-%d %H:00', {column})"
        return f"date({column})"

    def bucket_labels(self) -> list[str]:
        now = datetime.now(timezone.utc)
        if self.hours:
            anchor = now.replace(minute=0, second=0, microsecond=0)
            return [
                (anchor - timedelta(hours=offset)).strftime("%Y-%m-%d %H:00")
                for offset in range(self.hours - 1, -1, -1)
            ]
        today = now.date()
        days = self.days or DEFAULT_DAYS
        return [
            (today - timedelta(days=offset)).isoformat()
            for offset in range(days - 1, -1, -1)
        ]

    @property
    def previous_label(self) -> str:
        if self.hours:
            return f"{self.hours} jam sebelumnya"
        return f"{self.days or DEFAULT_DAYS} hari sebelumnya"
