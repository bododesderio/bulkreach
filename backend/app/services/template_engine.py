# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Personalisation engine (Sections 3.2, 6.2, 13.3).

Only `{{double_brace}}` merge tags are supported, so rendering is a bounded, pure
regex substitution — NOT a Jinja `render()`. This deliberately avoids handing the
user-authored campaign body to a template engine: a body like
`{% for i in range(1e9) %}` or `{{ "A" * 2**30 }}` would otherwise be evaluated
once per recipient inside the worker (CPU/memory self-DoS). Tags are
case-insensitive; unknown tags render empty. Email escapes each substituted value
(XSS-safe) while the template's own HTML passes through literally.
Provides GSM-7 / Unicode length info for the composer warning.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass

# {{tag}} or {{tag|default}} — a default fallback is used when the recipient's
# value is missing/empty (and makes the tag optional, so it always validates).
_TAG_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?))?\s*}}")

# GSM-7 basic + extension characters (Section 3.2 / glossary GSM-7)
_GSM7_BASIC = set(
    "@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ!\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\n\r"
)
_GSM7_EXT = set("^{}\\[~]|€")


class TemplateError(ValueError):
    """Raised when a template is syntactically invalid."""


def _lower_keys(data: dict) -> dict:
    """Merge tags are case-insensitive — normalise both template and data to lower."""
    return {str(k).lower(): v for k, v in data.items()}


def _iter_tags(template: str):
    """Yield (name, default) for each merge tag; default is None when omitted."""
    for m in _TAG_RE.finditer(template or ""):
        yield m.group(1).lower(), m.group(2)


def extract_merge_tags(template: str) -> list[str]:
    """Return the distinct merge-tag names referenced in a template."""
    return sorted({name for name, _ in _iter_tags(template)})


def validate_template(template: str, available_tags: list[str]) -> list[str]:
    """Return tags used but not available (empty = valid). A tag with a `|default`
    fallback is optional — it never counts as invalid."""
    available = {t.lower() for t in available_tags}
    return sorted({
        name for name, default in _iter_tags(template)
        if default is None and name not in available
    })


def _render(template: str, data: dict, *, escape: bool) -> str:
    d = _lower_keys(data)

    def _sub(m: re.Match) -> str:
        value = d.get(m.group(1).lower())
        s = "" if value is None else str(value)
        if not s and m.group(2) is not None:  # empty/missing → use the fallback
            s = m.group(2)
        return html.escape(s) if escape else s

    return _TAG_RE.sub(_sub, template or "")


def render_sms(template: str, data: dict) -> str:
    return _render(template, data, escape=False)


def render_email_body(template: str, data: dict) -> str:
    """Render HTML email body — merge-tag values are HTML-escaped (XSS-safe)."""
    return _render(template, data, escape=True)


def render_subject(template: str, data: dict) -> str:
    return render_sms(template, data)  # subject is plain text


@dataclass
class SmsLengthInfo:
    encoding: str  # 'GSM-7' | 'Unicode'
    length: int
    per_part: int
    parts: int


def sms_length_info(text: str) -> SmsLengthInfo:
    """GSM-7 vs Unicode part calculation (Section 3.2 note)."""
    is_gsm7 = all(c in _GSM7_BASIC or c in _GSM7_EXT for c in text)
    # Extension chars cost 2 septets in GSM-7
    length = sum(2 if c in _GSM7_EXT else 1 for c in text) if is_gsm7 else len(text)
    if is_gsm7:
        per_part = 160 if length <= 160 else 153  # UDH overhead on concatenation
        encoding = "GSM-7"
    else:
        per_part = 70 if length <= 70 else 67
        encoding = "Unicode"
    parts = 1 if length <= (160 if is_gsm7 else 70) else -(-length // per_part)
    return SmsLengthInfo(encoding=encoding, length=length, per_part=per_part, parts=parts)


def preview_render(template: str, sample: dict, *, html: bool = False) -> str:
    return render_email_body(template, sample) if html else render_sms(template, sample)
