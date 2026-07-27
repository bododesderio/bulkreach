"""multi-step signup: email verification + onboarding profile

Revision ID: d7f1a2c9e011
Revises: f6b9d2e40a71
Create Date: 2026-07-27 13:50:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d7f1a2c9e011"
down_revision: Union[str, None] = "f6b9d2e40a71"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("accounts", sa.Column("contact_name", sa.String(length=255), nullable=True))
    op.add_column("accounts", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column(
        "accounts",
        sa.Column("marketing_opt_in", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("accounts", sa.Column("industry", sa.String(length=60), nullable=True))
    op.add_column(
        "accounts",
        sa.Column("use_case", postgresql.JSONB(astext_type=sa.Text()),
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
    )
    op.add_column("accounts", sa.Column("referral_source", sa.String(length=60), nullable=True))

    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evt_user", "email_verification_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_evt_user", table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")
    for col in ("referral_source", "use_case", "industry", "marketing_opt_in", "phone", "contact_name"):
        op.drop_column("accounts", col)
    op.drop_column("users", "email_verified")
