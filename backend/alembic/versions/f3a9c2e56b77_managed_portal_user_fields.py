"""managed portal: user_type + must_change_password

Revision ID: f3a9c2e56b77
Revises: e2c4a7b18d33
Create Date: 2026-07-27 15:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f3a9c2e56b77"
down_revision: Union[str, None] = "e2c4a7b18d33"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("user_type", sa.String(length=20), server_default="self_service", nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "user_type")
