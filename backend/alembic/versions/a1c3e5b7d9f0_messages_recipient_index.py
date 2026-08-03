# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""messages recipient index: fast inbound-SMS opt-out lookup

Revision ID: a1c3e5b7d9f0
Revises: f1a4c6e8b2d3
Create Date: 2026-08-03

The inbound-SMS STOP/START handler resolves the most recent SMS to a number with
`WHERE channel='sms' AND recipient=? ORDER BY created_at DESC`. Without an index on
recipient that is a seq-scan + sort of the whole messages table on every inbound
webhook. Add a composite (recipient, created_at) index so the lookup is a range
scan that also satisfies the ORDER BY.
"""
from alembic import op

revision = "a1c3e5b7d9f0"
down_revision = "f1a4c6e8b2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_messages_recipient_created", "messages", ["recipient", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_messages_recipient_created", table_name="messages")
