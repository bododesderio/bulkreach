"""Admin payment configuration (superadmin only).

Configure each gateway's credentials + test/live mode, toggle it on/off, and map
each payment method to a provider. Secrets are encrypted at rest and returned
masked; submitting a masked (unchanged) value is a no-op so the UI can round-trip
without ever seeing the real secret.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.payment_provider import (
    PAYMENT_METHODS,
    PaymentProviderConfig,
    PaymentSettings,
)
from app.schemas.payment import (
    ProviderConfigOut,
    ProviderConfigUpdate,
    RoutingOut,
    RoutingUpdate,
)
from app.services.payments.registry import PROVIDER_CLASSES

router = APIRouter(prefix="/admin/payments", tags=["admin:payments"])

_MASK_PREFIX = "••••"


def _secret_keys(slug: str) -> set[str]:
    cls = PROVIDER_CLASSES.get(slug)
    return {f.key for f in cls.credential_fields if f.secret} if cls else set()


def _to_out(slug: str, config: PaymentProviderConfig | None) -> ProviderConfigOut:
    cls = PROVIDER_CLASSES[slug]
    secret_keys = _secret_keys(slug)
    creds_out: dict[str, str] = {}
    stored = (config.credentials if config else {}) or {}
    for f in cls.credential_fields:
        raw = stored.get(f.key, "")
        value = decrypt_secret(raw) if isinstance(raw, str) else ""
        creds_out[f.key] = mask_secret(value) if f.key in secret_keys else value
    return ProviderConfigOut(
        slug=slug,
        display_name=cls.display_name,
        enabled=config.enabled if config else False,
        mode=config.mode if config else "test",
        supported_methods=list(cls.supported_methods),
        credential_fields=[
            {"key": f.key, "label": f.label, "secret": f.secret,
             "required": f.required, "placeholder": f.placeholder}
            for f in cls.credential_fields
        ],
        credentials=creds_out,
    )


@router.get("/providers", response_model=list[ProviderConfigOut])
async def list_providers(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProviderConfigOut]:
    res = await db.execute(select(PaymentProviderConfig))
    by_slug = {c.slug: c for c in res.scalars()}
    return [_to_out(slug, by_slug.get(slug)) for slug in PROVIDER_CLASSES if slug != "simulator"]


@router.put("/providers/{slug}", response_model=ProviderConfigOut)
async def update_provider(
    slug: str,
    body: ProviderConfigUpdate,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProviderConfigOut:
    if slug not in PROVIDER_CLASSES or slug == "simulator":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown provider")
    res = await db.execute(select(PaymentProviderConfig).where(PaymentProviderConfig.slug == slug))
    config = res.scalar_one_or_none()
    if config is None:
        config = PaymentProviderConfig(
            slug=slug, display_name=PROVIDER_CLASSES[slug].display_name, credentials={}
        )
        db.add(config)

    if body.enabled is not None:
        config.enabled = body.enabled
    if body.mode is not None:
        config.mode = body.mode
    if body.credentials is not None:
        secret_keys = _secret_keys(slug)
        merged = dict(config.credentials or {})
        for key, value in body.credentials.items():
            if key in secret_keys:
                if value.startswith(_MASK_PREFIX) or value == "":
                    continue  # unchanged masked value → keep existing
                merged[key] = encrypt_secret(value)
            else:
                merged[key] = value
        config.credentials = merged
    config.updated_by = admin.email
    await db.commit()
    await db.refresh(config)
    return _to_out(slug, config)


async def _get_settings(db: AsyncSession) -> PaymentSettings:
    row = await db.get(PaymentSettings, PaymentSettings.SINGLETON_ID)
    if row is None:
        row = PaymentSettings(id=PaymentSettings.SINGLETON_ID, routing={}, default_currency="UGX")
        db.add(row)
        await db.flush()
    return row


@router.get("/routing", response_model=RoutingOut)
async def get_routing(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RoutingOut:
    row = await _get_settings(db)
    await db.commit()
    return RoutingOut(routing=row.routing or {}, default_currency=row.default_currency)


@router.put("/routing", response_model=RoutingOut)
async def set_routing(
    body: RoutingUpdate,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RoutingOut:
    for method, slug in body.routing.items():
        if method not in PAYMENT_METHODS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown method '{method}'")
        if slug and (slug not in PROVIDER_CLASSES or method not in PROVIDER_CLASSES[slug].supported_methods):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Provider '{slug}' cannot settle '{method}'",
            )
    row = await _get_settings(db)
    row.routing = {k: v for k, v in body.routing.items() if v}
    row.default_currency = body.default_currency
    row.updated_by = admin.email
    await db.commit()
    return RoutingOut(routing=row.routing, default_currency=row.default_currency)
