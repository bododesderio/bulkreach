# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""message templates: reusable saved composer messages

Revision ID: c3e5a7b9d1f2
Revises: b2d4f6a8c1e0
Create Date: 2026-08-03
"""
import sqlalchemy as sa
from alembic import op

revision = "c3e5a7b9d1f2"
down_revision = "b2d4f6a8c1e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_templates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "account_id",
            sa.Uuid(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=10), nullable=False, server_default="sms"),
        sa.Column("sms_body", sa.Text(), nullable=True),
        sa.Column("email_subject", sa.String(length=500), nullable=True),
        sa.Column("email_html_body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_message_templates_account_id", "message_templates", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_message_templates_account_id", table_name="message_templates")
    op.drop_table("message_templates")
