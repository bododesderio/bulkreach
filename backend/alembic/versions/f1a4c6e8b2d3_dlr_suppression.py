# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""DLR ingestion + suppression: delivery states, campaign delivered/bounced, suppressions

Revision ID: f1a4c6e8b2d3
Revises: e9a3c5b7d1f2
Create Date: 2026-07-31 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1a4c6e8b2d3"
down_revision: Union[str, None] = "e9a3c5b7d1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Message: final delivery timestamp + fast lookup by provider id for DLRs.
    op.add_column("messages", sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_messages_provider_message_id", "messages", ["provider_message_id"])

    # Campaign: denormalised delivery counters.
    op.add_column("campaigns", sa.Column("delivered", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("campaigns", sa.Column("bounced", sa.Integer(), nullable=False, server_default="0"))

    # Per-account suppression list.
    op.create_table(
        "suppressions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("address", sa.String(length=320), nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", "channel", "address", name="uq_suppression_addr"),
    )
    op.create_index("ix_suppressions_account_id", "suppressions", ["account_id"])
    op.create_index("ix_suppression_lookup", "suppressions", ["account_id", "channel", "address"])


def downgrade() -> None:
    op.drop_index("ix_suppression_lookup", table_name="suppressions")
    op.drop_index("ix_suppressions_account_id", table_name="suppressions")
    op.drop_table("suppressions")
    op.drop_column("campaigns", "bounced")
    op.drop_column("campaigns", "delivered")
    op.drop_index("ix_messages_provider_message_id", table_name="messages")
    op.drop_column("messages", "delivered_at")
