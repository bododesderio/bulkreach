# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Structured logging with per-request correlation ids.

Stdlib-only. Every log record carries the id of the HTTP request that produced
it, propagated through a ``ContextVar`` so async tasks and service-layer loggers
inherit it for free — no threading of an id argument through call sites. In
production (``LOG_FORMAT=json``) each record is one JSON line for ingestion; in
development a compact human-readable line keeps the console legible.

The request-id middleware is a *pure ASGI* middleware, not a
``BaseHTTPMiddleware``: the latter runs the downstream endpoint in a separate
anyio task, so a ``ContextVar`` set in its ``dispatch`` before ``call_next`` is
invisible to the endpoint. A pure ASGI middleware sets the var in the same task
that runs the route, so propagation is guaranteed.
"""
from __future__ import annotations

import json
import logging
import re
import sys
import uuid
from contextvars import ContextVar

from app.core.config import settings

REQUEST_ID_HEADER = "X-Request-ID"
_HEADER_KEY = REQUEST_ID_HEADER.lower().encode()

# The current request's correlation id. Default "-" reads cleanly in logs emitted
# outside any request (worker crons, startup) without a None check at every site.
_request_id: ContextVar[str] = ContextVar("request_id", default="-")

# Incoming X-Request-ID is attacker-controlled and echoed into both logs and a
# response header — constrain it so it can't smuggle newlines (header injection)
# or unbounded junk. Anything outside this set → we mint our own id instead.
_UNSAFE_RID = re.compile(r"[^A-Za-z0-9._-]")

# LogRecord attributes present on every record; everything else in __dict__ is a
# caller-supplied `extra=` field worth surfacing in the JSON payload.
_STD_RECORD_ATTRS = frozenset(
    logging.LogRecord("", 0, "", 0, "", None, None).__dict__
) | {"request_id", "message", "asctime", "taskName"}


def get_request_id() -> str:
    """The current request's correlation id ("-" outside a request)."""
    return _request_id.get()


def set_request_id(rid: str) -> None:
    _request_id.set(rid)


def _clean_incoming(raw: str | None) -> str | None:
    """Return a safe caller-supplied id, or None to mint a fresh one."""
    if not raw:
        return None
    raw = raw.strip()
    # Reject (→ mint fresh) rather than truncate: a clipped id would look like it
    # correlates with the caller's trace when it no longer does.
    if not raw or len(raw) > 128 or _UNSAFE_RID.search(raw):
        return None
    return raw


class RequestIdFilter(logging.Filter):
    """Stamp the active request id onto every record so formatters can render it."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = _request_id.get()
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line: ts, level, logger, msg, request_id (+ exc, extras)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        for key, value in record.__dict__.items():
            if key not in _STD_RECORD_ATTRS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


class RequestIdMiddleware:
    """Pure-ASGI: bind a correlation id for the request and echo it downstream.

    Reuses a safe inbound ``X-Request-ID`` (so a trace spans the edge → app) or
    mints one, exposes it on the response, and always resets the ``ContextVar``.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = None
        for name, value in scope.get("headers", ()):  # ASGI headers are (bytes, bytes)
            if name == _HEADER_KEY:
                incoming = value.decode("latin-1", "ignore")
                break
        rid = _clean_incoming(incoming) or uuid.uuid4().hex
        rid_bytes = rid.encode("latin-1")

        async def send_wrapper(message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((_HEADER_KEY, rid_bytes))
            await send(message)

        token = _request_id.set(rid)
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            _request_id.reset(token)


_configured = False


def configure_logging() -> None:
    """Install the structured handler on the root logger (idempotent).

    App loggers (``bulkreach.*``) and uvicorn are routed through one handler so
    every line — access, error, service — shares the same format and request id.
    """
    global _configured
    if _configured:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    if settings.resolved_log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.LOG_LEVEL.upper())

    # Route uvicorn's own loggers through our handler instead of their defaults so
    # access/error lines are structured too. (No-op when running under pytest.)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True

    _configured = True
