# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Inbound delivery-report (DLR) webhooks (Section 6).

Public, unauthenticated by design — each provider authenticates via signature
(Mailgun) or a secret callback URL + the edge rate-limit (Africa's Talking). The
raw body is parsed per-provider into normalised delivery events and applied
idempotently to the matching messages."""
from __future__ import annotations

import json
from typing import Annotated
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.net import client_ip
from app.core.redis import sliding_window_allow
from app.services import deliveries, dlr_providers

router = APIRouter(prefix="/webhooks/dlr", tags=["deliveries"])


@router.post("/{provider}", include_in_schema=False)
async def dlr_webhook(
    provider: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    ip = client_ip(request) or "0.0.0.0"
    if not await sliding_window_allow(f"dlr:webhook:{ip}", 300, 60):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests")

    raw = await request.body()
    ctype = request.headers.get("content-type", "")
    payload = None
    form = None
    if "application/json" in ctype:
        try:
            payload = json.loads(raw or b"null")
        except Exception:  # noqa: BLE001 — a malformed body is a no-op, not a 500
            payload = None
    else:
        form = dict(parse_qsl(raw.decode("utf-8", "replace"))) if raw else {}

    verified, events = dlr_providers.parse(provider, raw, payload, form)
    if not verified:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature")

    applied = 0
    for e in events:
        if await deliveries.record_delivery(
            db, provider=provider, provider_message_id=e["provider_message_id"],
            outcome=e["outcome"], raw=e.get("raw"), commit=False,
        ):
            applied += 1
    await db.commit()
    return {"received": len(events), "applied": applied}
