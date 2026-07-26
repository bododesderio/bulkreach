"""plan manager fields (period, status, featured, display_order)

Revision ID: f6b9d2e40a71
Revises: e5a8c1f24d63
Create Date: 2026-07-26 19:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f6b9d2e40a71"
down_revision: Union[str, None] = "e5a8c1f24d63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("period", sa.String(length=10), server_default="month", nullable=False))
    op.add_column("plans", sa.Column("status", sa.String(length=10), server_default="active", nullable=False))
    op.add_column("plans", sa.Column("featured", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("plans", sa.Column("display_order", sa.Integer(), server_default="100", nullable=False))


def downgrade() -> None:
    op.drop_column("plans", "display_order")
    op.drop_column("plans", "featured")
    op.drop_column("plans", "status")
    op.drop_column("plans", "period")
