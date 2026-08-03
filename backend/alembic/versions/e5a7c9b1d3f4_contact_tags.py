# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""contact tags + campaign audience_tags: segmentation

Revision ID: e5a7c9b1d3f4
Revises: d4f6b8a0c2e3
Create Date: 2026-08-03
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "e5a7c9b1d3f4"
down_revision = "d4f6b8a0c2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contacts",
        sa.Column("tags", pg.JSONB(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "campaigns",
        sa.Column("audience_tags", pg.JSONB(), nullable=False, server_default="[]"),
    )
    # GIN index so `tags ?| array[...]` segment filters stay fast.
    op.create_index(
        "ix_contacts_tags", "contacts", ["tags"], postgresql_using="gin"
    )


def downgrade() -> None:
    op.drop_index("ix_contacts_tags", table_name="contacts")
    op.drop_column("campaigns", "audience_tags")
    op.drop_column("contacts", "tags")
