"""managed pipeline: draft copy + copy-approval token + flags + 15-state remap

Revision ID: d2b3c4e5f6a7
Revises: c1a2b3d4e5f6
Create Date: 2026-07-28 13:35:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d2b3c4e5f6a7"
down_revision: Union[str, None] = "c1a2b3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("managed_campaigns", "status",
                    type_=sa.String(length=30), existing_type=sa.String(length=20))
    op.add_column("managed_campaigns", sa.Column("copy_sms", sa.Text(), nullable=True))
    op.add_column("managed_campaigns", sa.Column("copy_email_subject", sa.String(length=500), nullable=True))
    op.add_column("managed_campaigns", sa.Column("copy_email_body", sa.Text(), nullable=True))
    op.add_column("managed_campaigns", sa.Column("approval_token_hash", sa.String(length=64), nullable=True))
    op.add_column("managed_campaigns", sa.Column("approval_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("managed_campaigns", sa.Column("approval_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("managed_campaigns", sa.Column("change_request_note", sa.Text(), nullable=True))
    op.add_column("managed_campaigns", sa.Column("on_hold", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("managed_campaigns", sa.Column("cancelled", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index("ix_managed_campaigns_approval_token_hash", "managed_campaigns", ["approval_token_hash"])

    # Remap legacy stage names to the new 15-state vocabulary.
    op.execute("UPDATE managed_campaigns SET status = 'approved' WHERE status = 'copy_approved'")
    op.execute("UPDATE managed_campaigns SET status = 'sent' WHERE status = 'complete'")


def downgrade() -> None:
    op.execute("UPDATE managed_campaigns SET status = 'copy_approved' WHERE status = 'approved'")
    op.execute("UPDATE managed_campaigns SET status = 'complete' WHERE status = 'sent'")
    op.drop_index("ix_managed_campaigns_approval_token_hash", table_name="managed_campaigns")
    for col in ("cancelled", "on_hold", "change_request_note", "approval_expires_at",
                "approval_sent_at", "approval_token_hash", "copy_email_body",
                "copy_email_subject", "copy_sms"):
        op.drop_column("managed_campaigns", col)
    op.alter_column("managed_campaigns", "status",
                    type_=sa.String(length=20), existing_type=sa.String(length=30))
