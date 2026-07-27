"""Subscription enforcement (Section K): the three-layer quota + feature gate
that must pass before any campaign dispatches.

- quota.py  : Redis monthly/daily counters (EAT boundaries) — the source of truth
              for "how much has this account sent this period".
- enforce.py: the hard gate (active plan, feature gates, concurrent limit,
              monthly + daily quota) plus the quota-state read for the UI.
"""
from app.services.subscription import enforce, quota

__all__ = ["enforce", "quota"]
