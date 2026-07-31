# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""hot-path indexes: created_at range/sort + status filters (audit perf H3/C12)

Covers the client campaign list, account analytics, admin aggregate maps, revenue
sweeps, and message pagination — all of which ordered/filtered on unindexed
created_at / status columns.

Revision ID: e9a3c5b7d1f2
Revises: d8f2b3c4e5a6
Create Date: 2026-07-31 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e9a3c5b7d1f2"
down_revision: Union[str, None] = "d8f2b3c4e5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Client campaign list + per-account analytics: WHERE account_id ORDER BY created_at.
    op.create_index("ix_campaigns_account_created", "campaigns", ["account_id", "created_at"])
    # Admin overview / account-detail 30-day message + join windows.
    op.create_index("ix_accounts_created_at", "accounts", ["created_at"])
    # deleted_at IS NULL is on nearly every account query; partial keeps it small.
    op.create_index(
        "ix_accounts_status_active", "accounts", ["status"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # resolve_limits / MRR map / plan rollup all filter subscriptions.status == 'active'.
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])
    # Revenue sweeps: WHERE status='successful' AND created_at >= since.
    op.create_index("ix_payments_status_created", "payments", ["status", "created_at"])
    # Message pagination + resume: ORDER BY created_at within a campaign.
    op.create_index("ix_messages_campaign_created", "messages", ["campaign_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_messages_campaign_created", table_name="messages")
    op.drop_index("ix_payments_status_created", table_name="payments")
    op.drop_index("ix_subscriptions_status", table_name="subscriptions")
    op.drop_index("ix_accounts_status_active", table_name="accounts")
    op.drop_index("ix_accounts_created_at", table_name="accounts")
    op.drop_index("ix_campaigns_account_created", table_name="campaigns")
