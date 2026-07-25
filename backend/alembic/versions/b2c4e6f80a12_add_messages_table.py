"""add messages table (M3 dispatch tracking)

Revision ID: b2c4e6f80a12
Revises: a17de3df0311
Create Date: 2026-07-25 12:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b2c4e6f80a12"
down_revision: Union[str, None] = "a17de3df0311"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "messages",
        sa.Column("campaign_id", sa.UUID(), nullable=False),
        sa.Column("campaign_contact_id", sa.UUID(), nullable=True),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("recipient", sa.String(length=320), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("error_reason", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["campaign_contact_id"], ["campaign_contacts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_messages_campaign_id"), "messages", ["campaign_id"], unique=False)
    op.create_index(op.f("ix_messages_status"), "messages", ["status"], unique=False)
    op.create_index("ix_messages_campaign_status", "messages", ["campaign_id", "status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_messages_campaign_status", table_name="messages")
    op.drop_index(op.f("ix_messages_status"), table_name="messages")
    op.drop_index(op.f("ix_messages_campaign_id"), table_name="messages")
    op.drop_table("messages")
