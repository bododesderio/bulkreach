"""notifications: notifications + notification_preferences

Revision ID: b8c2d4e6f1a3
Revises: a7b1c9d3e5f2
Create Date: 2026-07-27 16:05:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b8c2d4e6f1a3"
down_revision: Union[str, None] = "a7b1c9d3e5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("type", sa.String(length=60), nullable=False),
        sa.Column("level", sa.String(length=10), server_default="info", nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link", sa.String(length=255), nullable=True),
        sa.Column("meta", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notifications_account_id", "notifications", ["account_id"])
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])
    op.create_index("ix_notifications_account_read", "notifications", ["account_id", "read_at"])

    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channels", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notification_preferences_account_id", "notification_preferences",
                    ["account_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_notification_preferences_account_id", table_name="notification_preferences")
    op.drop_table("notification_preferences")
    op.drop_index("ix_notifications_account_read", table_name="notifications")
    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_index("ix_notifications_account_id", table_name="notifications")
    op.drop_table("notifications")
