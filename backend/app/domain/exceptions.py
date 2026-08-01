# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Domain (business-rule) errors.

The service layer raises these instead of `fastapi.HTTPException` so that the
same code paths work whether they're driven by an HTTP request or by the ARQ
worker — the worker can react to a specific failure (e.g. a scheduled campaign
hitting the quota gate) instead of a broad `except Exception` swallowing it,
while the API translates them to HTTP responses via a single handler.

`http_status` is a plain int hint for that handler; the domain does not import
any web framework.
"""
from __future__ import annotations


class DomainError(Exception):
    """Base for business-rule violations.

    Carries a machine-readable `code` and an optional structured `detail` payload
    that the API surfaces as `{"detail": {"code": ..., **detail}}`.
    """

    http_status: int = 400

    def __init__(
        self,
        code: str,
        *,
        detail: dict | None = None,
        message: str | None = None,
    ) -> None:
        self.code = code
        self.detail = detail or {}
        super().__init__(message or code)


class SendNotAllowed(DomainError):
    """The subscription/quota gate rejected a send (Section K, Layer 2):
    inactive subscription, feature not on plan, concurrent-send cap, or monthly/
    daily quota exhausted. Maps to HTTP 402 for interactive callers."""

    http_status = 402
