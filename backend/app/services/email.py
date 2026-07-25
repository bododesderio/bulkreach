"""Transactional email sender via Mailgun SMTP (Section 2.3, 13.2 STARTTLS).

Bulk campaign dispatch is a separate high-throughput sender (M3, dispatch/email_dispatch.py);
this helper is for one-off system mail: password resets, confirmations, report delivery.
"""
from __future__ import annotations

import logging
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("bulkreach.email")


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    plain: str | None = None,
    from_email: str | None = None,
    from_name: str | None = None,
) -> bool:
    """Send a single transactional email. Returns True on success.

    If SMTP is not configured (dev without Mailgun), logs and returns False rather
    than raising — callers treat delivery as best-effort.
    """
    if not settings.MAILGUN_SMTP_USER or not settings.MAILGUN_SMTP_PASSWORD:
        logger.warning("SMTP not configured; skipping email to %s (subject=%s)", to, subject)
        return False

    import aiosmtplib  # lazy — keeps app import light and optional in dev

    msg = EmailMessage()
    msg["From"] = f"{from_name or settings.DEFAULT_FROM_NAME} <{from_email or settings.DEFAULT_FROM_EMAIL}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(plain or "Please view this message in an HTML-capable client.")
    msg.add_alternative(html, subtype="html")

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.MAILGUN_SMTP_HOST,
            port=settings.MAILGUN_SMTP_PORT,
            username=settings.MAILGUN_SMTP_USER,
            password=settings.MAILGUN_SMTP_PASSWORD,
            start_tls=True,
        )
        return True
    except Exception:  # noqa: BLE001 — transactional mail must never crash the request
        logger.exception("Failed to send email to %s", to)
        return False
