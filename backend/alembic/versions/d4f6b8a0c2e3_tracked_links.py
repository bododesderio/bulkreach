# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""tracked links: per-campaign URLs rewritten to click-counting redirects

Revision ID: d4f6b8a0c2e3
Revises: c3e5a7b9d1f2
Create Date: 2026-08-03
"""
import sqlalchemy as sa
from alembic import op

revision = "d4f6b8a0c2e3"
down_revision = "c3e5a7b9d1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tracked_links",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(length=16), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_links_campaign_id", "tracked_links", ["campaign_id"])
    op.create_index("ix_tracked_links_slug", "tracked_links", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tracked_links_slug", table_name="tracked_links")
    op.drop_index("ix_tracked_links_campaign_id", table_name="tracked_links")
    op.drop_table("tracked_links")
