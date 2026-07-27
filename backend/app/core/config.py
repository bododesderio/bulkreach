"""Application configuration — all runtime settings loaded from environment.

Every value maps to Section 10.2 of the BulkReach System Documentation v2.0.
Nothing is hardcoded; the .env file is the single source of secrets.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=True
    )

    # --- Core ---
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = Field(..., min_length=32)
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "BulkReach"
    BASE_URL: str = "https://api.bulkreach.ug"
    FRONTEND_URL: str = "http://localhost:3100"

    # --- Auth ---
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h per spec 13.1
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # --- Databases ---
    DATABASE_URL: str = "postgresql+asyncpg://bulkreach:pw@localhost:5432/bulkreach"
    ARCHIVE_DATABASE_URL: str = (
        "postgresql+asyncpg://bulkreach:pw@localhost:3110/bulkreach_archive"
    )
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    # --- Redis / ARQ ---
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- ClickHouse ---
    CLICKHOUSE_HOST: str = "localhost"
    CLICKHOUSE_PORT: int = 3112  # lane 3100 host mapping → container 8123
    CLICKHOUSE_ARCHIVE_HOST: str = "localhost"
    CLICKHOUSE_ARCHIVE_PORT: int = 3114  # lane 3100 host mapping → container 8123
    CLICKHOUSE_USER: str = "default"
    CLICKHOUSE_PASSWORD: str = ""
    CLICKHOUSE_DB: str = "bulkreach"

    # --- Email: provider selection (Section 2.3) ---
    # "auto" = first configured provider by priority, else simulator (non-prod).
    EMAIL_PROVIDER: Literal[
        "auto", "mailgun", "mailgun_smtp", "sendgrid", "ses", "postmark", "smtp", "simulator"
    ] = "auto"
    DEFAULT_FROM_EMAIL: str = "noreply@bulkreach.ug"
    DEFAULT_FROM_NAME: str = "BulkReach"

    # Mailgun (HTTP API + SMTP)
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = "mg.bulkreach.ug"
    MAILGUN_API_BASE: str = "https://api.mailgun.net"  # EU: https://api.eu.mailgun.net
    MAILGUN_SMTP_HOST: str = "smtp.mailgun.org"
    MAILGUN_SMTP_PORT: int = 587
    MAILGUN_SMTP_USER: str = ""
    MAILGUN_SMTP_PASSWORD: str = ""

    # SendGrid (HTTP API)
    SENDGRID_API_KEY: str = ""

    # Amazon SES (via SMTP interface)
    SES_SMTP_HOST: str = "email-smtp.us-east-1.amazonaws.com"
    SES_SMTP_PORT: int = 587
    SES_SMTP_USER: str = ""
    SES_SMTP_PASSWORD: str = ""

    # Postmark (HTTP API)
    POSTMARK_SERVER_TOKEN: str = ""
    POSTMARK_MESSAGE_STREAM: str = "outbound"

    # Generic SMTP (any provider)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = True

    # --- SMS: provider selection (Section 2.3) ---
    SMS_PROVIDER: Literal[
        "auto", "africas_talking", "twilio", "infobip", "vonage", "simulator"
    ] = "auto"

    # Africa's Talking
    AT_API_KEY: str = ""
    AT_USERNAME: str = "sandbox"
    AT_SENDER_ID: str = "BulkReach"
    AT_API_BASE: str = "https://api.africastalking.com"  # sandbox: https://api.sandbox.africastalking.com

    # Twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""  # E.164, e.g. +1XXXXXXXXXX
    TWILIO_MESSAGING_SERVICE_SID: str = ""  # optional, overrides from-number

    # Infobip
    INFOBIP_BASE_URL: str = ""  # e.g. https://xxxxx.api.infobip.com
    INFOBIP_API_KEY: str = ""
    INFOBIP_SENDER: str = "BulkReach"

    # Vonage (Nexmo)
    VONAGE_API_KEY: str = ""
    VONAGE_API_SECRET: str = ""
    VONAGE_FROM: str = "BulkReach"

    # Force the labelled simulator even when real provider creds exist (dev/testing).
    DISPATCH_FORCE_SIMULATOR: bool = False
    # Simulator failure rate (0-1) so the retry path is exercised in dev.
    SIMULATOR_FAILURE_RATE: float = 0.06
    # Run dispatch in-process (FastAPI BackgroundTasks) instead of enqueuing to the
    # ARQ worker. Convenient when no separate worker is running (dev). Prod = False.
    DISPATCH_INLINE: bool = False
    SCHEDULE_POLL_SECONDS: int = 30  # cron cadence for promoting scheduled campaigns

    # --- Payments ---
    # Provider credentials (Flutterwave, Pesapal, MTN MoMo, Airtel) are configured
    # from the admin UI and stored encrypted in the DB — NOT here. This key encrypts
    # them at rest; leave blank in dev (derived from SECRET_KEY), set a dedicated
    # urlsafe-base64 32-byte key in production and rotate independently.
    PAYMENTS_ENCRYPTION_KEY: str = ""
    # Public base for building payment redirect/callback URLs the provider sends
    # the customer back to. Defaults to FRONTEND_URL when blank.
    PAYMENTS_CALLBACK_BASE_URL: str = ""

    # Legacy Flutterwave env fallback (superseded by DB-stored provider config).
    FLUTTERWAVE_PUBLIC_KEY: str = ""
    FLUTTERWAVE_SECRET_KEY: str = ""
    FLUTTERWAVE_ENCRYPTION_KEY: str = ""
    FLUTTERWAVE_WEBHOOK_SECRET: str = ""
    FLUTTERWAVE_BASE_URL: str = "https://api.flutterwave.com/v3"

    # --- Object storage (S3 / MinIO) ---
    S3_ENDPOINT_URL: str = "http://localhost:3120"  # blank for AWS S3; lane 3100 → MinIO container 9000
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY: str = "minio"
    S3_SECRET_KEY: str = "minio123"
    S3_BUCKET: str = "bulkreach-uploads"
    S3_ARCHIVE_BUCKET: str = "bulkreach-archive"
    S3_GLACIER_BUCKET: str = "bulkreach-glacier"

    # --- Billing / invoicing (Section 14 + Uganda tax) ---
    # Uganda standard VAT is 18%. Plan prices are quoted VAT-INCLUSIVE (gross),
    # so an invoice backs the net + VAT out of the total.
    VAT_RATE: float = 0.18
    VAT_INCLUSIVE: bool = True
    BILLING_COMPANY_NAME: str = "BulkReach (Kakebe Technologies)"
    BILLING_COMPANY_ADDRESS: str = "Lira City, Northern Uganda"
    BILLING_TAX_ID: str = ""  # TIN — shown on the invoice when set
    BILLING_SUPPORT_EMAIL: str = "billing@bulkreach.ug"
    SUBSCRIPTION_PERIOD_DAYS: int = 30
    # Auto-renewal + dunning ladder (failed-payment day 0 → 30).
    RENEWAL_SWEEP_HOUR: int = 1        # 01:00 EAT: expire + open dunning
    DUNNING_SWEEP_HOUR: int = 9        # 09:00 EAT: advance the ladder + remind
    DUNNING_GRACE_DAYS: int = 30       # suspend after this many days past due
    DUNNING_STAGE_DAYS: tuple[int, ...] = (0, 3, 7, 14, 30)

    # --- Archive subsystem (Sections 20-21) ---
    ARCHIVE_INGESTION_HOUR: int = 2  # 02:00 EAT
    ARCHIVE_RETENTION_HOUR: int = 3  # 03:00 EAT
    ARCHIVE_LIVE_RETENTION_MONTHS: int = 6
    ARCHIVE_BATCH_SIZE: int = 100
    ARCHIVE_CLICKHOUSE_TTL_YEARS: int = 7
    ARCHIVE_GLACIER_TRANSITION_DAYS: int = 365
    # Keyed pepper for contact anonymisation (HMAC) so hashes aren't offline-
    # reversible over the low-entropy MSISDN space. Blank → derived from SECRET_KEY.
    ANON_PEPPER: str = ""

    # --- Dispatch tuning (Section 3.3) ---
    EMAIL_BATCH_SIZE: int = 500
    SMS_BATCH_SIZE: int = 300
    INTER_BATCH_DELAY_SECONDS: float = 1.0
    MAX_RECIPIENTS_PER_CAMPAIGN: int = 20_000
    MAX_RETRIES_PER_MESSAGE: int = 3

    # --- Rate limits (Section 13.4) ---
    RATE_LIMIT_LOGIN_MAX: int = 5
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: int = 15 * 60
    RATE_LIMIT_UPLOAD_MAX_PER_HOUR: int = 10
    MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024  # 50MB

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
