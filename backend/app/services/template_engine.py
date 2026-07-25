"""Personalisation engine (Sections 3.2, 6.2, 13.3).

Jinja2 SandboxedEnvironment with {{double_brace}} syntax. Case-insensitive tags.
SMS renders plain text; email renders with autoescape=True so merge-tag XSS is
impossible. Provides GSM-7 / Unicode length info for the composer warning.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from jinja2 import meta
from jinja2.sandbox import SandboxedEnvironment

_TAG_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")

# GSM-7 basic + extension characters (Section 3.2 / glossary GSM-7)
_GSM7_BASIC = set(
    "@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ!\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\n\r"
)
_GSM7_EXT = set("^{}\\[~]|€")

# Plain-text environment (SMS) — no autoescape
_sms_env = SandboxedEnvironment(variable_start_string="{{", variable_end_string="}}", autoescape=False)
# HTML environment (email) — autoescape ON to prevent XSS via merge tags
_html_env = SandboxedEnvironment(variable_start_string="{{", variable_end_string="}}", autoescape=True)


class TemplateError(ValueError):
    """Raised when a template is syntactically invalid."""


def _lower_keys(data: dict) -> dict:
    """Merge tags are case-insensitive — normalise both template and data to lower."""
    return {str(k).lower(): v for k, v in data.items()}


def _normalise_template(template: str) -> str:
    return _TAG_RE.sub(lambda m: "{{ " + m.group(1).lower() + " }}", template)


def extract_merge_tags(template: str) -> list[str]:
    """Return the distinct merge-tag names referenced in a template."""
    try:
        ast = _sms_env.parse(_normalise_template(template or ""))
    except Exception as exc:  # noqa: BLE001
        raise TemplateError(str(exc)) from exc
    return sorted(meta.find_undeclared_variables(ast))


def validate_template(template: str, available_tags: list[str]) -> list[str]:
    """Return a list of tags used but not available (empty = valid)."""
    available = {t.lower() for t in available_tags}
    return [t for t in extract_merge_tags(template) if t not in available]


def render_sms(template: str, data: dict) -> str:
    try:
        return _sms_env.from_string(_normalise_template(template or "")).render(**_lower_keys(data))
    except Exception as exc:  # noqa: BLE001
        raise TemplateError(str(exc)) from exc


def render_email_body(template: str, data: dict) -> str:
    """Render HTML email body — autoescaped."""
    try:
        return _html_env.from_string(_normalise_template(template or "")).render(**_lower_keys(data))
    except Exception as exc:  # noqa: BLE001
        raise TemplateError(str(exc)) from exc


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
