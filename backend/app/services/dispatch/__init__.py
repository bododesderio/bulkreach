"""Campaign dispatch subsystem (M3) — multi-provider SMS/email with retry,
Redis progress and a labelled dev simulator. Section 2.3 / 3.3."""
from .base import SendResult, close_http
from .email_providers import available_email_providers, get_email_provider
from .engine import dispatch_campaign
from .sms_providers import available_sms_providers, get_sms_provider

__all__ = [
    "dispatch_campaign",
    "get_sms_provider",
    "get_email_provider",
    "available_sms_providers",
    "available_email_providers",
    "SendResult",
    "close_http",
]
