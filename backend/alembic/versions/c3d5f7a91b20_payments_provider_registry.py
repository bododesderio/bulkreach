"""payments provider registry + generalized payment columns

Revision ID: c3d5f7a91b20
Revises: b2c4e6f80a12
Create Date: 2026-07-26 17:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c3d5f7a91b20"
down_revision: Union[str, None] = "b2c4e6f80a12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_providers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=30), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("mode", sa.String(length=10), server_default="test", nullable=False),
        sa.Column("credentials", postgresql.JSONB(astext_type=sa.Text()),
                  server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("updated_by", sa.String(length=320), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "payment_settings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("routing", postgresql.JSONB(astext_type=sa.Text()),
                  server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("default_currency", sa.String(length=3), server_default="UGX", nullable=False),
        sa.Column("updated_by", sa.String(length=320), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "payment_webhook_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("signature_valid", sa.Boolean(), nullable=False),
        sa.Column("tx_ref", sa.String(length=120), nullable=True),
        sa.Column("source_ip", sa.String(length=64), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()),
                  server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_webhook_events_provider"), "payment_webhook_events", ["provider"])
    op.create_index(op.f("ix_payment_webhook_events_tx_ref"), "payment_webhook_events", ["tx_ref"])

    # --- Generalize the payments table (was Flutterwave-specific) ---
    op.add_column("payments", sa.Column("currency", sa.String(length=3), server_default="UGX", nullable=False))
    op.add_column("payments", sa.Column("purpose", sa.String(length=30), server_default="subscription", nullable=False))
    op.add_column("payments", sa.Column("provider", sa.String(length=30), nullable=True))
    op.add_column("payments", sa.Column("provider_tx_id", sa.String(length=160), nullable=True))
    op.add_column("payments", sa.Column("plan_id", sa.UUID(), nullable=True))
    op.add_column("payments", sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()),
                                        server_default=sa.text("'{}'::jsonb"), nullable=False))
    op.add_column("payments", sa.Column("updated_at", sa.DateTime(timezone=True),
                                        server_default=sa.text("now()"), nullable=False))
    op.create_foreign_key("fk_payments_plan_id", "payments", "plans", ["plan_id"], ["id"], ondelete="SET NULL")
    op.create_index(op.f("ix_payments_provider"), "payments", ["provider"])
    op.create_index(op.f("ix_payments_provider_tx_id"), "payments", ["provider_tx_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_payments_provider_tx_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_provider"), table_name="payments")
    op.drop_constraint("fk_payments_plan_id", "payments", type_="foreignkey")
    for col in ("updated_at", "raw_response", "plan_id", "provider_tx_id", "provider", "purpose", "currency"):
        op.drop_column("payments", col)

    op.drop_index(op.f("ix_payment_webhook_events_tx_ref"), table_name="payment_webhook_events")
    op.drop_index(op.f("ix_payment_webhook_events_provider"), table_name="payment_webhook_events")
    op.drop_table("payment_webhook_events")
    op.drop_table("payment_settings")
    op.drop_table("payment_providers")
