# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""drop dormant managed columns: client sign-off + team assignment

Revision ID: b2d4f6a8c1e0
Revises: a1c3e5b7d9f0
Create Date: 2026-08-03

The managed service is now run entirely by the admin — no client copy-approval
step and no assigning jobs to a team member. The columns that backed those
flows are no longer read or written, so drop them (and the approval-token
index). The pipeline `status` column is untouched; existing jobs keep their
state, the admin UI just maps every pre-send state to the "Content" step.
"""
import sqlalchemy as sa
from alembic import op

revision = "b2d4f6a8c1e0"
down_revision = "a1c3e5b7d9f0"
branch_labels = None
depends_on = None

_TABLE = "managed_campaigns"
_COLUMNS = (
    "account_manager_id",
    "approved_at",
    "approval_token_hash",
    "approval_sent_at",
    "approval_expires_at",
    "change_request_note",
)


def upgrade() -> None:
    op.drop_index("ix_managed_campaigns_approval_token_hash", table_name=_TABLE)
    for col in _COLUMNS:
        op.drop_column(_TABLE, col)


def downgrade() -> None:
    op.add_column(_TABLE, sa.Column("account_manager_id", sa.Uuid(), nullable=True))
    op.add_column(_TABLE, sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(_TABLE, sa.Column("approval_token_hash", sa.String(length=64), nullable=True))
    op.add_column(_TABLE, sa.Column("approval_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(_TABLE, sa.Column("approval_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(_TABLE, sa.Column("change_request_note", sa.Text(), nullable=True))
    op.create_index(
        "ix_managed_campaigns_approval_token_hash", _TABLE, ["approval_token_hash"]
    )
