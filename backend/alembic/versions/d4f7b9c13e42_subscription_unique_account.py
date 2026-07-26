"""unique subscription per account (idempotent settlement upsert)

Revision ID: d4f7b9c13e42
Revises: c3d5f7a91b20
Create Date: 2026-07-26 17:45:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d4f7b9c13e42"
down_revision: Union[str, None] = "c3d5f7a91b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Collapse any pre-existing duplicates before enforcing uniqueness (keep newest).
    op.execute(
        """
        DELETE FROM subscriptions s
        USING subscriptions s2
        WHERE s.account_id = s2.account_id
          AND s.ctid < s2.ctid
        """
    )
    op.create_unique_constraint("uq_subscriptions_account_id", "subscriptions", ["account_id"])


def downgrade() -> None:
    op.drop_constraint("uq_subscriptions_account_id", "subscriptions", type_="unique")
