"""payment refund columns

Revision ID: e5a8c1f24d63
Revises: d4f7b9c13e42
Create Date: 2026-07-26 18:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e5a8c1f24d63"
down_revision: Union[str, None] = "d4f7b9c13e42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payments", sa.Column("refund_provider_id", sa.String(length=160), nullable=True))
    op.add_column("payments", sa.Column("refund_reason", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "refund_reason")
    op.drop_column("payments", "refund_provider_id")
    op.drop_column("payments", "refunded_at")
