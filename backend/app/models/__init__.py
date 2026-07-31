# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Import all models so Alembic autogenerate and relationships resolve."""
from app.models.account import Account, ApiKey, AuditLog, User
from app.models.auth import AuthEvent, RefreshToken
from app.models.billing import Payment, Plan, Subscription
from app.models.campaign import (
    Campaign,
    CampaignContact,
    ManagedCampaign,
    Message,
    Report,
)
from app.models.cms import CmsFaq, CmsFeature, CmsPageSection, CmsTestimonial
from app.models.contact import Contact, ContactList
from app.models.invoicing import Invoice, InvoiceSequence
from app.models.notification import Notification, NotificationPreference
from app.models.payment_provider import (
    PaymentProviderConfig,
    PaymentSettings,
    RawWebhookEvent,
)
from app.models.suppression import Suppression

__all__ = [
    "Account",
    "User",
    "ApiKey",
    "AuditLog",
    "RefreshToken",
    "AuthEvent",
    "ContactList",
    "Contact",
    "Campaign",
    "CampaignContact",
    "Message",
    "ManagedCampaign",
    "Report",
    "Plan",
    "Subscription",
    "Payment",
    "Invoice",
    "InvoiceSequence",
    "Notification",
    "NotificationPreference",
    "CmsFaq",
    "CmsFeature",
    "CmsTestimonial",
    "CmsPageSection",
    "PaymentProviderConfig",
    "PaymentSettings",
    "RawWebhookEvent",
]
