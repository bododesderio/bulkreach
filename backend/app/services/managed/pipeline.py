"""Managed-service 15-state pipeline: the state graph + copy-approval tokens.

The linear happy path is STAGES (index order = "forward"). ``changes_requested``
is an off-line loop state entered when a client rejects the drafted copy; from it
the manager either revises (→ drafting) or re-sends (→ awaiting_approval).

A move is allowed when it is a forward jump along STAGES (any distance — managers
may skip stages), or one of the explicit loop edges. ``on_hold`` / ``cancelled``
are orthogonal boolean flags on the row, not stages, so a job can be paused at any
point without losing its place.
"""
from __future__ import annotations

import hashlib
import secrets

# Linear pipeline (index defines forward order).
STAGES: list[str] = [
    "requested",          # 1  brief submitted (entry)
    "briefed",            # 2  brief logged by admin
    "assigned",           # 3  account manager assigned
    "audience_pending",   # 4  awaiting client contact list
    "audience_ready",     # 5  contacts imported + validated
    "drafting",           # 6  copy being written
    "internal_review",    # 7  copy under internal QA
    "awaiting_approval",  # 8  copy sent to client (token issued)
    "approved",           # 9  client approved via token
    "scheduled",          # 10 send scheduled
    "sending",            # 11 dispatching
    "sent",               # 12 dispatch complete
    "report_issued",      # 13 branded PDF generated + emailed
    "closed",             # 14 job archived
]
LOOP_STATE = "changes_requested"          # 15 client requested changes (off-line)
ALL_STATES: frozenset[str] = frozenset(STAGES) | {LOOP_STATE}

# Explicit non-forward edges the graph permits.
_LOOP_EDGES: set[tuple[str, str]] = {
    ("awaiting_approval", LOOP_STATE),          # client rejects
    (LOOP_STATE, "drafting"),                   # manager revises
    (LOOP_STATE, "awaiting_approval"),          # manager re-sends
}

# States from which a client copy-approval decision is valid.
APPROVAL_OPEN = "awaiting_approval"
# Reaching this (or later) means dispatch finished → a report can be issued.
DISPATCH_DONE = "sent"
TERMINAL = ("sent", "report_issued", "closed")
IN_FLIGHT = ("scheduled", "sending")

APPROVAL_TTL_DAYS = 14


def index(stage: str) -> int:
    try:
        return STAGES.index(stage)
    except ValueError:
        return -1


def is_valid(stage: str) -> bool:
    return stage in ALL_STATES


def can_transition(current: str, target: str) -> bool:
    """True if ``current`` → ``target`` is a permitted move (excludes no-ops)."""
    if current == target or target not in ALL_STATES:
        return False
    if (current, target) in _LOOP_EDGES:
        return True
    ci, ti = index(current), index(target)
    return ci >= 0 and ti > ci  # forward jump along the linear pipeline


def reached(stage: str, marker: str) -> bool:
    """True if ``stage`` is at or past ``marker`` on the linear pipeline."""
    return index(stage) >= index(marker) >= 0


# ── Copy-approval token ──
def new_token() -> tuple[str, str]:
    """Return (clear_token, sha256_hash). Only the hash is stored."""
    token = secrets.token_hex(32)  # 256-bit
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
