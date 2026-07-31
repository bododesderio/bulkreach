# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""per-client plan controls: subscription overrides

Revision ID: d8f2b3c4e5a6
Revises: c7e1a2f3d4b5
Create Date: 2026-07-31 16:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d8f2b3c4e5a6"
down_revision: Union[str, None] = "c7e1a2f3d4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("manually_assigned", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("subscriptions", sa.Column("custom_messages_per_month", sa.Integer(), nullable=True))
    op.add_column("subscriptions", sa.Column("custom_daily_limit", sa.Integer(), nullable=True))
    op.add_column("subscriptions", sa.Column("custom_price_ugx", sa.BigInteger(), nullable=True))
    op.add_column(
        "subscriptions",
        sa.Column("custom_features", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "custom_features")
    op.drop_column("subscriptions", "custom_price_ugx")
    op.drop_column("subscriptions", "custom_daily_limit")
    op.drop_column("subscriptions", "custom_messages_per_month")
    op.drop_column("subscriptions", "manually_assigned")
