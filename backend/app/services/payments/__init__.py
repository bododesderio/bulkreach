"""Payment provider registry + service (multi-provider, admin-configurable)."""
from app.services.payments.service import payment_service

__all__ = ["payment_service"]
