# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Structured logging + request-id correlation (core/logging.py).

DB-free: the pure-ASGI middleware and formatter are exercised directly with a
stub downstream app, so these run without the brtest datastores."""
from __future__ import annotations

import json
import logging

import pytest

from app.core.logging import (
    JsonFormatter,
    RequestIdFilter,
    RequestIdMiddleware,
    _clean_incoming,
    get_request_id,
)


def _record(msg: str = "hello", **extra) -> logging.LogRecord:
    rec = logging.LogRecord("bulkreach.test", logging.INFO, __file__, 1, msg, None, None)
    for k, v in extra.items():
        setattr(rec, k, v)
    return rec


# --- formatter / filter -----------------------------------------------------

def test_json_formatter_is_one_valid_line_with_core_fields():
    rec = _record("dispatch started")
    RequestIdFilter().filter(rec)
    out = JsonFormatter().format(rec)
    assert "\n" not in out
    parsed = json.loads(out)
    assert parsed["msg"] == "dispatch started"
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "bulkreach.test"
    assert parsed["request_id"] == "-"  # no active request


def test_json_formatter_surfaces_extra_fields():
    rec = _record("sent", request_id="rid-1", campaign_id="c-42")
    out = json.loads(JsonFormatter().format(rec))
    assert out["request_id"] == "rid-1"
    assert out["campaign_id"] == "c-42"


def test_json_formatter_includes_exception():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys

        rec = logging.LogRecord(
            "bulkreach.test", logging.ERROR, __file__, 1, "failed", None, sys.exc_info()
        )
    out = json.loads(JsonFormatter().format(rec))
    assert "ValueError: boom" in out["exc"]


# --- inbound id sanitisation ------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("trace-abc_123", "trace-abc_123"),
        ("  spaced-id  ", "spaced-id"),  # trimmed, still safe
        (None, None),
        ("", None),
        ("has space", None),  # header injection surface → rejected
        ("bad\nvalue", None),
        ("a" * 200, None),  # over the 128-char cap → rejected
    ],
)
def test_clean_incoming(raw, expected):
    assert _clean_incoming(raw) == expected


# --- middleware (pure ASGI) -------------------------------------------------

async def _run(headers: list[tuple[bytes, bytes]]) -> tuple[dict, list]:
    seen: dict = {}
    sent: list = []

    async def downstream(scope, receive, send):
        # Proves the ContextVar is visible to the endpoint in the SAME task —
        # the exact propagation a BaseHTTPMiddleware would lose.
        seen["rid"] = get_request_id()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    await RequestIdMiddleware(downstream)({"type": "http", "headers": headers}, receive, send)
    return seen, sent


def _response_headers(sent: list) -> list[tuple[bytes, bytes]]:
    start = next(m for m in sent if m["type"] == "http.response.start")
    return start["headers"]


@pytest.mark.asyncio
async def test_middleware_reuses_safe_inbound_id():
    seen, sent = await _run([(b"x-request-id", b"trace-xyz")])
    assert seen["rid"] == "trace-xyz"
    assert (b"x-request-id", b"trace-xyz") in _response_headers(sent)


@pytest.mark.asyncio
async def test_middleware_mints_id_when_absent():
    seen, sent = await _run([])
    assert seen["rid"] and seen["rid"] != "-"
    assert len(seen["rid"]) == 32  # uuid4().hex
    assert (b"x-request-id", seen["rid"].encode()) in _response_headers(sent)


@pytest.mark.asyncio
async def test_middleware_rejects_unsafe_inbound_id():
    seen, _ = await _run([(b"x-request-id", b"evil value")])
    assert seen["rid"] != "evil value"
    assert len(seen["rid"]) == 32  # minted a fresh one instead


@pytest.mark.asyncio
async def test_middleware_resets_contextvar_after_request():
    await _run([(b"x-request-id", b"trace-xyz")])
    assert get_request_id() == "-"  # no leak into the next request/task
