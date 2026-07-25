"""Seed subscription plans (Section 14.1). Idempotent — upserts by name."""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.database import LiveSessionLocal
from app.models.billing import Plan

PLANS = [
    {
        "name": "Starter",
        "price_ugx": 50_000,
        "messages_per_month": 5_000,
        "batch_size": 5_000,
        "features": {
            "formats": ["csv", "paste"],
            "analytics": "basic",
            "pdf_delivery_report": True,
            "support": "email",
        },
    },
    {
        "name": "Growth",
        "price_ugx": 150_000,
        "messages_per_month": 50_000,
        "batch_size": 20_000,
        "features": {
            "formats": ["csv", "xlsx", "docx", "pdf", "paste"],
            "scheduling": True,
            "retry": True,
            "branded_client_reports": True,
            "support": "priority",
        },
    },
    {
        "name": "Business",
        "price_ugx": 400_000,
        "messages_per_month": -1,  # unlimited
        "batch_size": 20_000,
        "features": {
            "all_growth": True,
            "multi_user": True,
            "rest_api": True,
            "webhooks": True,
            "white_label": True,
        },
    },
    {
        "name": "Managed service",
        "price_ugx": 0,  # custom per project
        "messages_per_month": 20_000,
        "batch_size": 20_000,
        "features": {
            "full_management": True,
            "dedicated_account_manager": True,
            "branded_client_report": True,
            "sla": True,
        },
    },
]


async def main() -> None:
    async with LiveSessionLocal() as db:
        for spec in PLANS:
            plan = await db.scalar(select(Plan).where(Plan.name == spec["name"]))
            if plan:
                for k, v in spec.items():
                    setattr(plan, k, v)
            else:
                db.add(Plan(**spec))
        await db.commit()
        print(f"Seeded {len(PLANS)} plans.")


if __name__ == "__main__":
    asyncio.run(main())
