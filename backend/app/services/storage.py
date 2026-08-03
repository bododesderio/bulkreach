# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Object storage abstraction — S3/MinIO with a local-filesystem fallback.

The spec (Section 2.2) uses S3/MinIO for uploaded files, with a local storage
fallback. In dev without MinIO we transparently store under STORAGE_DIR; in
production boto3 targets S3/MinIO. Callers never care which backend is active.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("bulkreach.storage")

_LOCAL_ROOT = Path(settings.__dict__.get("STORAGE_DIR", "/tmp/bulkreach-storage"))


class Storage:
    """Minimal async-friendly storage interface (methods are sync but fast/local)."""

    def __init__(self) -> None:
        self._s3 = None
        if settings.S3_ACCESS_KEY and settings.S3_SECRET_KEY and settings.S3_ENDPOINT_URL:
            self._s3 = self._try_s3_client()
        if self._s3 is None:
            _LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
            logger.info("Storage: using local filesystem fallback at %s", _LOCAL_ROOT)

    def _try_s3_client(self):
        try:
            import boto3  # lazy
            from botocore.config import Config

            client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL or None,
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
                region_name=settings.S3_REGION,
                config=Config(connect_timeout=2, retries={"max_attempts": 1}),
            )
            # Probe — if unreachable, fall back to local
            client.list_buckets()
            self._ensure_bucket(client, settings.S3_BUCKET)
            logger.info("Storage: using S3/MinIO at %s", settings.S3_ENDPOINT_URL)
            return client
        except Exception as exc:  # noqa: BLE001
            logger.warning("S3 unavailable (%s); falling back to local storage.", exc)
            return None

    @staticmethod
    def _ensure_bucket(client, bucket: str) -> None:
        try:
            client.head_bucket(Bucket=bucket)
        except Exception:  # noqa: BLE001
            client.create_bucket(Bucket=bucket)

    @staticmethod
    def _local_path(key: str):
        """Resolve `key` under the local root, refusing any `..`/absolute escape."""
        path = (_LOCAL_ROOT / key).resolve()
        if not path.is_relative_to(_LOCAL_ROOT.resolve()):
            raise ValueError("Invalid storage key")
        return path

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        if self._s3 is not None:
            self._s3.put_object(Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=content_type)
            return f"s3://{settings.S3_BUCKET}/{key}"
        path = self._local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"file://{path}"

    def get(self, key: str) -> bytes:
        if self._s3 is not None:
            obj = self._s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
            return obj["Body"].read()
        return self._local_path(key).read_bytes()


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = Storage()
    return _storage
