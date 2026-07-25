"""Create the first superadmin (Section 11.3).

Usage: python scripts/create_superadmin.py --email admin@bulkreach.ug --password secret
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import LiveSessionLocal
from app.core.security import hash_password
from app.models.account import Account, User


async def main(email: str, password: str) -> None:
    now = datetime.now(timezone.utc)
    async with LiveSessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == email))
        if existing:
            print(f"User {email} already exists.")
            return
        account = Account(
            name="BulkReach Platform",
            email=email,
            plan="internal",
            accepted_terms_at=now,
            accepted_privacy_at=now,
            accepted_data_retention_at=now,
            terms_acceptance_ip="127.0.0.1",
            terms_acceptance_user_agent="cli/create_superadmin",
        )
        db.add(account)
        await db.flush()
        db.add(
            User(
                account_id=account.id,
                email=email,
                hashed_password=hash_password(password),
                role="superadmin",
            )
        )
        await db.commit()
        print(f"Superadmin created: {email}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    args = p.parse_args()
    asyncio.run(main(args.email, args.password))
