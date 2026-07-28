"""cms: faqs, features, testimonials, page_sections (+ seed current marketing content)

Revision ID: c1a2b3d4e5f6
Revises: b8c2d4e6f1a3
Create Date: 2026-07-28 13:20:00.000000
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c1a2b3d4e5f6"
down_revision: Union[str, None] = "b8c2d4e6f1a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _base_cols(*extra):
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        *extra,
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    faqs = op.create_table(
        "cms_faqs",
        *_base_cols(
            sa.Column("question", sa.String(length=300), nullable=False),
            sa.Column("answer", sa.Text(), nullable=False),
            sa.Column("category", sa.String(length=60), nullable=True),
        ),
    )
    features = op.create_table(
        "cms_features",
        *_base_cols(
            sa.Column("icon", sa.String(length=60), nullable=False),
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
        ),
    )
    testimonials = op.create_table(
        "cms_testimonials",
        *_base_cols(
            sa.Column("quote", sa.Text(), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("role", sa.String(length=160), nullable=False),
        ),
    )
    sections = op.create_table(
        "cms_page_sections",
        *_base_cols(
            sa.Column("page", sa.String(length=60), nullable=False),
            sa.Column("key", sa.String(length=60), nullable=False),
            sa.Column("value", sa.Text(), server_default="", nullable=False),
        ),
        sa.UniqueConstraint("page", "key", name="uq_cms_page_sections_page_key"),
    )

    _seed(faqs, features, testimonials, sections)


def _seed(faqs, features, testimonials, sections) -> None:
    def rows(items, build):
        return [{"id": uuid.uuid4(), "sort_order": i, "is_published": True, **build(x)}
                for i, x in enumerate(items)]

    op.bulk_insert(faqs, rows(_FAQS, lambda x: {"question": x[0], "answer": x[1], "category": None}))
    op.bulk_insert(features, rows(_FEATURES, lambda x: {"icon": x[0], "title": x[1], "description": x[2]}))
    op.bulk_insert(testimonials, rows(_TESTIMONIALS, lambda x: {"quote": x[0], "name": x[1], "role": x[2]}))
    op.bulk_insert(sections, [
        {"id": uuid.uuid4(), "page": p, "key": k, "value": v, "sort_order": i, "is_published": True}
        for i, (p, k, v) in enumerate(_SECTIONS)
    ])


def downgrade() -> None:
    op.drop_table("cms_page_sections")
    op.drop_table("cms_testimonials")
    op.drop_table("cms_features")
    op.drop_table("cms_faqs")


# ── Seed content (mirrors the frontend seed-data at build time) ──
_FAQS = [
    ("What file formats can I upload contacts from?",
     "CSV, Excel (.xlsx/.xls), Word (.docx), PDF, and comma/newline pasted text. Phone and email columns are detected automatically from column headers or by sampling values."),
    ("What's the difference between self-service and managed?",
     "Self-service: you upload contacts, write the message, and send — all in the dashboard. Managed: you brief our team and we handle everything from contact import to dispatch and the branded client report."),
    ("Do my clients receive a branded report?",
     "Yes. Every campaign generates a branded client success report with your logo, custom header, delivery confirmation, and key metrics. Auto-emailed on completion."),
    ("How does the free trial work?",
     "500 messages free on signup, no credit card required. Full Growth plan features active. Trial expires after 14 days or 500 messages, whichever comes first."),
    ("What payment methods are accepted?",
     "MTN Mobile Money, Airtel Money, Visa, and Mastercard. All payments processed via Flutterwave. Subscriptions auto-renew monthly."),
    ("What happens if some messages fail to deliver?",
     "The retry engine retries failed messages up to 3 times with exponential backoff. Failure reasons are logged and appear in your analytics PDF report with the exact error from the provider."),
    ("Do I need recipients to have opted in before I can send?",
     "Yes. All campaigns must comply with Uganda Communications Commission (UCC) regulations. Recipients must have opted in to receive bulk messages. BulkReach enforces opt-in acknowledgement at the campaign creation step and logs consent records for audit purposes."),
    ("What happens when my SMS is longer than 160 characters?",
     "Standard SMS messages are 160 characters. Longer messages are automatically split into concatenated parts (up to 3 parts, 456 characters total) and billed as separate messages. BulkReach shows you the live character count and message-part count as you compose, so you always know your cost before you send."),
    ("What happens to my data after I close my account?",
     "Contact data, campaign records, and analytics reports are retained for 90 days after account closure, then permanently and irreversibly deleted. You can export all your data at any time from your account settings before closing."),
    ("Can I schedule campaigns in advance?",
     "Yes. You can schedule any campaign for a future date and time. The system uses East Africa Time (EAT, UTC+3). Scheduled campaigns can be edited or cancelled up to 15 minutes before the send time. You will receive a dashboard notification and email confirmation when the campaign starts dispatching."),
]

_FEATURES = [
    ("Upload", "Any contact format",
     "Upload from any source. Phone and email columns detected automatically. No reformatting needed."),
    ("Code", "Personalised at scale",
     'Every message rendered individually with merge tags. "Dear {{first_name}}, your balance is UGX {{amount}}."'),
    ("LayoutGrid", "SMS + email together",
     "Send both channels in one campaign. Dispatched concurrently so your audience gets the message wherever they are."),
    ("BarChart2", "PDF analytics report",
     "Auto-generated after every campaign. Delivery rates, open rates, failure reasons, and time-series charts."),
    ("Award", "Branded client reports",
     "Branded PDF with your logo and delivery confirmation — auto-emailed to your client after every managed campaign."),
    ("Clock", "Schedule & retry",
     "Send now or pick a future time. Failed messages retried 3× with exponential backoff — nothing slips through."),
]

_TESTIMONIALS = [
    ("We sent payment reminders to 8,000 borrowers in under 20 minutes. The personalised SMS with each client's balance increased our on-time collection rate noticeably.",
     "Grace Nakato", "Operations Manager, Kampala Microfinance"),
    ("We briefed the BulkReach team on Monday. By Wednesday our 15,000-member email campaign was done and we had a branded PDF to show leadership. Effortless.",
     "James Oryema", "Communications Director, Uganda Traders Alliance"),
    ("The PDF analytics report is exactly what our clients expect. We use the managed service for every product launch now — it's become a core part of how we run campaigns.",
     "Prossy Acan", "Marketing Lead, Jinja Agro Holdings"),
]

_SECTIONS = [
    ("faq", "hero_eyebrow", "FAQ"),
    ("faq", "hero_title", "Frequently asked questions."),
    ("faq", "hero_subtitle", "Everything you need to know about BulkReach — from file formats to compliance."),
    ("features", "hero_eyebrow", "PLATFORM FEATURES"),
    ("features", "hero_title", "Every tool to send campaigns that actually land."),
    ("features", "hero_subtitle", "BulkReach handles contact import, personalisation, dispatch, reporting, and compliance — so you can focus on the message."),
    ("pricing", "hero_eyebrow", "PRICING"),
    ("pricing", "hero_title", "Simple, Ugandan pricing."),
    ("pricing", "hero_subtitle", "All prices in UGX. No hidden fees. Cancel anytime."),
]
