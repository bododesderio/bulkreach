"""Provider registry — bridges DB config to live adapter instances.

Resolves the method→provider routing an admin set, decrypts stored credentials,
and returns a ready PaymentProvider. Falls back to the simulator only in
non-production when nothing is configured, so dev works with zero keys while prod
fails closed.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.models.payment_provider import (
    PAYMENT_METHODS,
    PaymentProviderConfig,
    PaymentSettings,
)
from app.services.payments.airtel import AirtelProvider
from app.services.payments.base import PaymentProvider
from app.services.payments.flutterwave import FlutterwaveProvider
from app.services.payments.mtn_momo import MtnMomoProvider
from app.services.payments.pesapal import PesapalProvider
from app.services.payments.simulator import SimulatorProvider

PROVIDER_CLASSES: dict[str, type[PaymentProvider]] = {
    cls.slug: cls
    for cls in (FlutterwaveProvider, PesapalProvider, MtnMomoProvider, AirtelProvider, SimulatorProvider)
}


def provider_metadata() -> list[dict]:
    """Static descriptor for the admin config UI (no DB, no secrets)."""
    out = []
    for slug, cls in PROVIDER_CLASSES.items():
        if slug == "simulator":
            continue
        out.append({
            "slug": slug,
            "display_name": cls.display_name,
            "supported_methods": list(cls.supported_methods),
            "credential_fields": [
                {"key": f.key, "label": f.label, "secret": f.secret,
                 "required": f.required, "placeholder": f.placeholder}
                for f in cls.credential_fields
            ],
        })
    return out


def _instantiate(config: PaymentProviderConfig) -> PaymentProvider:
    cls = PROVIDER_CLASSES[config.slug]
    creds = {k: decrypt_secret(v) if isinstance(v, str) else v for k, v in (config.credentials or {}).items()}
    return cls(mode=config.mode, credentials=creds)


async def get_config(db: AsyncSession, slug: str) -> PaymentProviderConfig | None:
    res = await db.execute(select(PaymentProviderConfig).where(PaymentProviderConfig.slug == slug))
    return res.scalar_one_or_none()


async def get_settings_row(db: AsyncSession) -> PaymentSettings | None:
    # Deterministic: the settings row is a singleton keyed on a fixed id.
    return await db.get(PaymentSettings, PaymentSettings.SINGLETON_ID)


async def enabled_methods(db: AsyncSession) -> list[dict]:
    """Payment methods currently offerable at checkout: each mapped to an enabled
    provider. Used to render the client method picker (no secrets)."""
    row = await get_settings_row(db)
    routing = (row.routing if row else {}) or {}
    res = await db.execute(
        select(PaymentProviderConfig).where(PaymentProviderConfig.enabled.is_(True))
    )
    enabled = {c.slug: c for c in res.scalars()}
    out = []
    for method in PAYMENT_METHODS:
        slug = routing.get(method)
        if slug and slug in enabled and method in PROVIDER_CLASSES[slug].supported_methods:
            out.append({"method": method, "provider": slug,
                        "provider_name": PROVIDER_CLASSES[slug].display_name})
    if not out and not settings.is_production:
        out = [{"method": m, "provider": "simulator", "provider_name": "Simulator (dev)"}
               for m in PAYMENT_METHODS]
    return out


async def resolve_provider_for_method(db: AsyncSession, method: str) -> PaymentProvider:
    """Return the enabled provider that should settle `method`, per routing."""
    row = await get_settings_row(db)
    routing = (row.routing if row else {}) or {}
    slug = routing.get(method)
    if slug:
        config = await get_config(db, slug)
        if config and config.enabled and method in PROVIDER_CLASSES[slug].supported_methods:
            return _instantiate(config)
    if not settings.is_production:
        return SimulatorProvider(mode="test")
    # Generic message — don't leak provider-config state to clients.
    raise ValueError("Payment method is not available right now")


async def load_provider_by_slug(db: AsyncSession, slug: str) -> PaymentProvider | None:
    """For webhook routing: build the adapter for a provider slug regardless of
    routing (a provider may receive callbacks for any method it settles)."""
    if slug == "simulator":
        return SimulatorProvider(mode="test") if not settings.is_production else None
    config = await get_config(db, slug)
    return _instantiate(config) if config else None
