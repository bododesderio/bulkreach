"""team invitation tokens

Revision ID: e2c4a7b18d33
Revises: d7f1a2c9e011
Create Date: 2026-07-27 14:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e2c4a7b18d33"
down_revision: Union[str, None] = "d7f1a2c9e011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invitation_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", sa.String(length=20), server_default="member", nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("invited_by", sa.UUID(), nullable=True),
        sa.Column("invited_by_email", sa.String(length=320), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_invitation_account", "invitation_tokens", ["account_id"])
    op.create_index("ix_invitation_email", "invitation_tokens", ["email"])
    op.create_index("ix_invitation_token_hash", "invitation_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_invitation_token_hash", table_name="invitation_tokens")
    op.drop_index("ix_invitation_email", table_name="invitation_tokens")
    op.drop_index("ix_invitation_account", table_name="invitation_tokens")
    op.drop_table("invitation_tokens")
