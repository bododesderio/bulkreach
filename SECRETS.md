# Secrets & key generation

None of these are committed. Generate them once per environment and store them
in your secret manager (or `.env.production`, which is git-ignored).

## Generate

```bash
# SECRET_KEY — JWT signing (≥32 chars)
openssl rand -hex 32

# ANON_PEPPER — HMAC pepper for contact anonymisation
openssl rand -hex 32

# PAYMENTS_ENCRYPTION_KEY — Fernet key (encrypts payment provider credentials).
# Must be a urlsafe base64 32-byte key:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Where each is used

| Var | Used by | Notes |
|-----|---------|-------|
| `SECRET_KEY` | api, worker | JWT access/refresh signing. Rotating it invalidates all sessions. |
| `PAYMENTS_ENCRYPTION_KEY` | api, worker | Fernet-encrypts provider creds at rest. **Required in production — the app fails closed at startup if unset.** Rotating it makes existing stored provider creds undecryptable (re-enter them in `/admin/settings/payments`). |
| `ANON_PEPPER` | api, worker | Keyed HMAC for anonymised phone/email. Keep stable or previously-anonymised contacts stop matching. |
| `POSTGRES_PASSWORD` | postgres, api, worker | DB auth. |
| `MINIO_ROOT_USER/PASSWORD` | minio, api, worker | Object storage (contacts, report PDFs, exports). Swap for real S3 keys in cloud. |
| Mailgun / Africa's Talking / Flutterwave | api, worker | Delivery + payments. Most payment creds are entered in the admin UI (encrypted), not env. |

## Rotation rules of thumb
- `SECRET_KEY`: safe to rotate; forces re-login.
- `PAYMENTS_ENCRYPTION_KEY` / `ANON_PEPPER`: **do not rotate casually** — see notes above.
- Provider live keys: rotate in `/admin/settings/payments`; the reconciler tolerates in-flight transactions.
