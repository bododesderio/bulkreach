"""invoicing + dunning: invoices, invoice_sequences, subscription dunning columns

Revision ID: a7b1c9d3e5f2
Revises: f3a9c2e56b77
Create Date: 2026-07-27 15:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a7b1c9d3e5f2"
down_revision: Union[str, None] = "f3a9c2e56b77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Subscription: auto-renewal + dunning ladder ---
    op.add_column("subscriptions", sa.Column(
        "auto_renew", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("subscriptions", sa.Column(
        "dunning_stage", sa.Integer(), server_default="0", nullable=False))
    op.add_column("subscriptions", sa.Column(
        "past_due_since", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscriptions", sa.Column(
        "last_dunning_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscriptions", sa.Column(
        "grace_until", sa.DateTime(timezone=True), nullable=True))

    # --- Gapless per-year invoice numbering ---
    op.create_table(
        "invoice_sequences",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("last_number", sa.Integer(), server_default="0", nullable=False),
    )

    # --- Invoices / receipts ---
    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("payments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("number", sa.String(length=40), nullable=False),
        sa.Column("kind", sa.String(length=20), server_default="receipt", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="paid", nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="UGX", nullable=False),
        sa.Column("subtotal_ugx", sa.BigInteger(), nullable=False),
        sa.Column("vat_rate", sa.Float(), nullable=False),
        sa.Column("vat_ugx", sa.BigInteger(), nullable=False),
        sa.Column("total_ugx", sa.BigInteger(), nullable=False),
        sa.Column("proration_credit_ugx", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("billing_name", sa.String(length=255), nullable=False),
        sa.Column("billing_email", sa.String(length=320), nullable=False),
        sa.Column("plan_name", sa.String(length=50), nullable=True),
        sa.Column("line_items", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_invoices_account_id", "invoices", ["account_id"])
    op.create_index("ix_invoices_payment_id", "invoices", ["payment_id"])
    op.create_index("ix_invoices_number", "invoices", ["number"], unique=True)
    op.create_index("ix_invoices_issued_at", "invoices", ["issued_at"])


def downgrade() -> None:
    op.drop_index("ix_invoices_issued_at", table_name="invoices")
    op.drop_index("ix_invoices_number", table_name="invoices")
    op.drop_index("ix_invoices_payment_id", table_name="invoices")
    op.drop_index("ix_invoices_account_id", table_name="invoices")
    op.drop_table("invoices")
    op.drop_table("invoice_sequences")
    op.drop_column("subscriptions", "grace_until")
    op.drop_column("subscriptions", "last_dunning_at")
    op.drop_column("subscriptions", "past_due_since")
    op.drop_column("subscriptions", "dunning_stage")
    op.drop_column("subscriptions", "auto_renew")
