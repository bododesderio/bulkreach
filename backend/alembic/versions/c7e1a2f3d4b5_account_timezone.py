# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""account timezone: self-service profile settings

Revision ID: c7e1a2f3d4b5
Revises: b4d6f8a02c15
Create Date: 2026-07-31 16:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c7e1a2f3d4b5"
down_revision: Union[str, None] = "b4d6f8a02c15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="Africa/Kampala",
        ),
    )


def downgrade() -> None:
    op.drop_column("accounts", "timezone")
