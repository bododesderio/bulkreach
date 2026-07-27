"""Shared helpers for admin analytics routers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

_PERIOD_DAYS = {"today": 1, "month": 30, "quarter": 90}


def period_bounds(period: str) -> tuple[datetime, datetime]:
    """Return (start, prev_start) for a rolling period. prev_start..start is the
    immediately preceding window of equal length, used for change-percentages."""
    now = datetime.now(timezone.utc)
    days = _PERIOD_DAYS.get(period, 30)
    start = now - timedelta(days=days)
    prev_start = start - timedelta(days=days)
    return start, prev_start


def pct_change(current: float, previous: float) -> float:
    if previous <= 0:
        return 100.0 if current > 0 else 0.0
    return round((current - previous) / previous * 100, 1)
