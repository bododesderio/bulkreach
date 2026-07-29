# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Generate an RS256 keypair for JWT signing and print .env-ready lines.

Usage:  python scripts/gen_jwt_keys.py
Copy the two exported blocks into the API's environment. When both are set the
app signs access/refresh/reset tokens with RS256 (private key) and verifies with
the public key; unset → HS256 fallback with SECRET_KEY. Keep the private key
secret and out of version control.
"""
from __future__ import annotations

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def _env_line(name: str, pem: str) -> str:
    # PEM contains newlines; encode them so it fits on one .env line.
    return f'{name}="{pem.strip().replace(chr(10), "\\n")}"'


def main() -> None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    print("# --- BulkReach JWT RS256 keypair — add to the API environment ---")
    print(_env_line("JWT_PRIVATE_KEY", private_pem))
    print(_env_line("JWT_PUBLIC_KEY", public_pem))


if __name__ == "__main__":
    main()
