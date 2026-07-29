"""session infra: rotating refresh_tokens + append-only auth_events

Revision ID: b4d6f8a02c15
Revises: d2b3c4e5f6a7
Create Date: 2026-07-29 11:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b4d6f8a02c15"
down_revision: Union[str, None] = "d2b3c4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("family_id", sa.UUID(), nullable=False),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.String(length=400), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(length=40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_account_id", "refresh_tokens", ["account_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])
    op.create_index("ix_refresh_family", "refresh_tokens", ["family_id"])

    op.create_table(
        "auth_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("refresh_token_id", sa.UUID(), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.String(length=400), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_events_account_id", "auth_events", ["account_id"])
    op.create_index("ix_auth_events_user_id", "auth_events", ["user_id"])
    op.create_index("ix_auth_events_user_created", "auth_events", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_auth_events_user_created", table_name="auth_events")
    op.drop_index("ix_auth_events_user_id", table_name="auth_events")
    op.drop_index("ix_auth_events_account_id", table_name="auth_events")
    op.drop_table("auth_events")

    op.drop_index("ix_refresh_family", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_account_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
