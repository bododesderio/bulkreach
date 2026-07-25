"""Email providers — pluggable, functional as soon as their keys are configured.

API providers: Mailgun (HTTP), SendGrid, Postmark. SMTP providers: Mailgun SMTP,
Amazon SES (SMTP), and a generic SMTP for anything else. Selection:
settings.EMAIL_PROVIDER ("auto" picks the first configured by priority).
"""
from __future__ import annotations

import logging
import random
import uuid
from email.message import EmailMessage
from email.utils import make_msgid

from app.core.config import settings

from .base import EmailProvider, SendResult, http

logger = logging.getLogger("bulkreach.dispatch.email")


def _build_message(
    *, to: str, subject: str, html: str, plain: str | None, from_email: str, from_name: str
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=settings.MAILGUN_DOMAIN or "bulkreach.ug")
    msg.set_content(plain or "Please view this message in an HTML-capable client.")
    msg.add_alternative(html, subtype="html")
    return msg


async def _smtp_send(
    *, host: str, port: int, user: str, password: str, starttls: bool, msg: EmailMessage
) -> None:
    import aiosmtplib  # lazy

    await aiosmtplib.send(
        msg,
        hostname=host,
        port=port,
        username=user or None,
        password=password or None,
        start_tls=starttls,
    )


class MailgunApiEmail:
    name = "mailgun"

    @property
    def configured(self) -> bool:
        return bool(settings.MAILGUN_API_KEY and settings.MAILGUN_DOMAIN)

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        try:
            resp = await http().post(
                f"{settings.MAILGUN_API_BASE.rstrip('/')}/v3/{settings.MAILGUN_DOMAIN}/messages",
                auth=("api", settings.MAILGUN_API_KEY),
                data={
                    "from": f"{from_name} <{from_email}>",
                    "to": to,
                    "subject": subject,
                    "html": html,
                    "text": plain or "",
                },
            )
            resp.raise_for_status()
            return SendResult(True, self.name, resp.json().get("id"))
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class SendGridEmail:
    name = "sendgrid"

    @property
    def configured(self) -> bool:
        return bool(settings.SENDGRID_API_KEY)

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        payload = {
            "personalizations": [{"to": [{"email": to}]}],
            "from": {"email": from_email, "name": from_name},
            "subject": subject,
            "content": (
                ([{"type": "text/plain", "value": plain}] if plain else [])
                + [{"type": "text/html", "value": html}]
            ),
        }
        try:
            resp = await http().post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
            )
            if resp.status_code < 300:
                return SendResult(True, self.name, resp.headers.get("X-Message-Id"))
            return SendResult(False, self.name, error=f"HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class PostmarkEmail:
    name = "postmark"

    @property
    def configured(self) -> bool:
        return bool(settings.POSTMARK_SERVER_TOKEN)

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        payload = {
            "From": f"{from_name} <{from_email}>",
            "To": to,
            "Subject": subject,
            "HtmlBody": html,
            "TextBody": plain or "",
            "MessageStream": settings.POSTMARK_MESSAGE_STREAM,
        }
        try:
            resp = await http().post(
                "https://api.postmarkapp.com/email",
                json=payload,
                headers={
                    "X-Postmark-Server-Token": settings.POSTMARK_SERVER_TOKEN,
                    "Accept": "application/json",
                },
            )
            body = resp.json()
            if resp.status_code < 300 and body.get("ErrorCode", 0) == 0:
                return SendResult(True, self.name, body.get("MessageID"))
            return SendResult(False, self.name, error=str(body.get("Message") or resp.status_code))
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class MailgunSmtpEmail:
    name = "mailgun_smtp"

    @property
    def configured(self) -> bool:
        return bool(settings.MAILGUN_SMTP_USER and settings.MAILGUN_SMTP_PASSWORD)

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        msg = _build_message(
            to=to, subject=subject, html=html, plain=plain, from_email=from_email, from_name=from_name
        )
        try:
            await _smtp_send(
                host=settings.MAILGUN_SMTP_HOST, port=settings.MAILGUN_SMTP_PORT,
                user=settings.MAILGUN_SMTP_USER, password=settings.MAILGUN_SMTP_PASSWORD,
                starttls=True, msg=msg,
            )
            return SendResult(True, self.name, msg["Message-ID"])
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class SesSmtpEmail:
    name = "ses"

    @property
    def configured(self) -> bool:
        return bool(settings.SES_SMTP_USER and settings.SES_SMTP_PASSWORD)

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        msg = _build_message(
            to=to, subject=subject, html=html, plain=plain, from_email=from_email, from_name=from_name
        )
        try:
            await _smtp_send(
                host=settings.SES_SMTP_HOST, port=settings.SES_SMTP_PORT,
                user=settings.SES_SMTP_USER, password=settings.SES_SMTP_PASSWORD,
                starttls=True, msg=msg,
            )
            return SendResult(True, self.name, msg["Message-ID"])
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class GenericSmtpEmail:
    name = "smtp"

    @property
    def configured(self) -> bool:
        return bool(settings.SMTP_HOST)

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        msg = _build_message(
            to=to, subject=subject, html=html, plain=plain, from_email=from_email, from_name=from_name
        )
        try:
            await _smtp_send(
                host=settings.SMTP_HOST, port=settings.SMTP_PORT,
                user=settings.SMTP_USER, password=settings.SMTP_PASSWORD,
                starttls=settings.SMTP_STARTTLS, msg=msg,
            )
            return SendResult(True, self.name, msg["Message-ID"])
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class EmailSimulator:
    """Labelled dev simulator — NEVER sends a real email."""

    name = "simulator"

    @property
    def configured(self) -> bool:
        return True

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        logger.info("[SIMULATED EMAIL] to=%s subject=%r from=%s", to, subject, from_email)
        if random.random() < settings.SIMULATOR_FAILURE_RATE:
            return SendResult(False, self.name, error="simulated_transient_failure")
        return SendResult(True, self.name, f"sim-email-{uuid.uuid4().hex[:16]}")


class _UnconfiguredEmail:
    name = "unconfigured"

    @property
    def configured(self) -> bool:
        return False

    async def send(self, *, to, subject, html, plain, from_email, from_name) -> SendResult:
        return SendResult(False, "unconfigured", error="email_provider_not_configured")


_REGISTRY: dict[str, type] = {
    "mailgun": MailgunApiEmail,
    "sendgrid": SendGridEmail,
    "postmark": PostmarkEmail,
    "mailgun_smtp": MailgunSmtpEmail,
    "ses": SesSmtpEmail,
    "smtp": GenericSmtpEmail,
    "simulator": EmailSimulator,
}
_PRIORITY = ["mailgun", "sendgrid", "postmark", "ses", "mailgun_smtp", "smtp"]


def available_email_providers() -> dict[str, bool]:
    return {name: _REGISTRY[name]().configured for name in _PRIORITY}


def get_email_provider() -> EmailProvider:
    if settings.DISPATCH_FORCE_SIMULATOR:
        return EmailSimulator()
    choice = settings.EMAIL_PROVIDER
    if choice == "simulator":
        return EmailSimulator()
    if choice != "auto":
        provider = _REGISTRY[choice]()
        if provider.configured:
            return provider
        logger.warning("Email provider '%s' selected but not configured.", choice)
    else:
        for name in _PRIORITY:
            provider = _REGISTRY[name]()
            if provider.configured:
                return provider
    if settings.is_production:
        logger.error("No email provider configured in production — messages will fail.")
        return _UnconfiguredEmail()
    logger.warning("No email provider configured — using labelled SIMULATOR (non-prod).")
    return EmailSimulator()
