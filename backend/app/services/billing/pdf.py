# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Branded invoice / receipt PDF (Section 14). WeasyPrint is imported lazily so the
module stays importable where cairo/pango are absent — only rendering needs them."""
from __future__ import annotations

import html
from datetime import datetime

from app.core.config import settings
from app.models.invoicing import Invoice

_BRAND_TEAL = "#0d9488"
_BRAND_NAVY = "#0f172a"


def _esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))


def _fmt_dt(dt: datetime | None) -> str:
    return dt.strftime("%d %b %Y") if dt else "—"


def _ugx(amount: int) -> str:
    sign = "-" if amount < 0 else ""
    return f"{sign}UGX {abs(int(amount)):,}"


def _render_html(invoice: Invoice) -> str:
    rows = ""
    for li in invoice.line_items or []:
        if li.get("meta") == "vat":
            continue  # VAT is shown in the totals block, not as a line
        rows += (
            f"<tr><td>{_esc(li.get('description'))}</td>"
            f"<td class='r'>{_ugx(int(li.get('amount_ugx', 0)))}</td></tr>"
        )

    tax_id = (
        f"<div>TIN: {_esc(settings.BILLING_TAX_ID)}</div>" if settings.BILLING_TAX_ID else ""
    )
    paid_badge = (
        '<span class="badge">PAID</span>' if invoice.status == "paid" else
        f'<span class="badge due">{_esc(invoice.status.upper())}</span>'
    )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page {{ size: A4; margin: 20mm 18mm; }}
  * {{ font-family: 'Helvetica Neue', Arial, sans-serif; }}
  body {{ color: {_BRAND_NAVY}; font-size: 11px; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 3px solid {_BRAND_TEAL}; padding-bottom: 14px; }}
  .brand {{ font-size: 20px; font-weight: 800; }}
  .brand small {{ display:block; font-size: 10px; font-weight: 500; color:#64748b; margin-top:2px; }}
  .doc {{ text-align: right; }}
  .doc h1 {{ font-size: 20px; margin: 0 0 4px; letter-spacing: 1px; }}
  .doc .num {{ font-family: monospace; font-size: 12px; color:#334155; }}
  .badge {{ display:inline-block; margin-top:6px; background:{_BRAND_TEAL}; color:#fff;
            font-size: 10px; font-weight: 700; padding: 2px 10px; border-radius: 999px; }}
  .badge.due {{ background:#f59e0b; }}
  .parties {{ display:flex; justify-content: space-between; margin: 22px 0 8px; }}
  .parties .label {{ font-size: 9px; text-transform: uppercase; letter-spacing:.5px; color:#94a3b8; margin-bottom:3px; }}
  .parties .box {{ font-size: 11px; line-height: 1.5; }}
  table.items {{ width: 100%; border-collapse: collapse; margin-top: 18px; }}
  table.items th {{ text-align:left; font-size: 9px; text-transform:uppercase; letter-spacing:.5px;
                    color:#64748b; border-bottom: 2px solid #e2e8f0; padding: 8px 6px; }}
  table.items td {{ padding: 9px 6px; border-bottom: 1px solid #eef2f7; }}
  td.r, th.r {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .totals {{ margin-top: 14px; margin-left: auto; width: 52%; }}
  .totals tr td {{ padding: 5px 6px; }}
  .totals .grand td {{ border-top: 2px solid {_BRAND_NAVY}; font-weight: 800; font-size: 13px; padding-top: 8px; }}
  .footer {{ margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0;
            font-size: 9px; color:#94a3b8; text-align:center; }}
</style></head><body>
  <div class="header">
    <div class="brand">{_esc(settings.BILLING_COMPANY_NAME)}
      <small>{_esc(settings.BILLING_COMPANY_ADDRESS)}</small>
      <small>{_esc(settings.BILLING_SUPPORT_EMAIL)}</small>
      {tax_id}
    </div>
    <div class="doc">
      <h1>{'RECEIPT' if invoice.kind == 'receipt' else 'INVOICE'}</h1>
      <div class="num">{_esc(invoice.number)}</div>
      <div style="font-size:10px;color:#64748b;margin-top:4px">Issued {_fmt_dt(invoice.issued_at)}</div>
      {paid_badge}
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="label">Billed to</div>
      <div class="box"><strong>{_esc(invoice.billing_name)}</strong><br/>{_esc(invoice.billing_email)}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Billing period</div>
      <div class="box">{_fmt_dt(invoice.period_start)} – {_fmt_dt(invoice.period_end)}</div>
    </div>
  </div>

  <table class="items">
    <tr><th>Description</th><th class="r">Amount</th></tr>
    {rows}
  </table>

  <table class="totals">
    <tr><td>Subtotal (net)</td><td class="r">{_ugx(invoice.subtotal_ugx)}</td></tr>
    <tr><td>VAT ({round(invoice.vat_rate * 100)}%)</td><td class="r">{_ugx(invoice.vat_ugx)}</td></tr>
    <tr class="grand"><td>Total {('paid' if invoice.status == 'paid' else 'due')}</td>
        <td class="r">{_ugx(invoice.total_ugx)}</td></tr>
  </table>

  <div class="footer">
    {_esc(settings.BILLING_COMPANY_NAME)} · This is a computer-generated document, valid without signature.
  </div>
</body></html>"""


def invoice_pdf(invoice: Invoice) -> bytes:
    from weasyprint import HTML  # lazy — native deps only needed here
    from app.core.pdf_safety import safe_url_fetcher

    # Defensive: the invoice template embeds no tenant URL today, but the hardened
    # fetcher keeps it SSRF-safe if that ever changes.
    return HTML(string=_render_html(invoice), url_fetcher=safe_url_fetcher).write_pdf()


def invoice_filename(invoice: Invoice) -> str:
    return f"{invoice.number}.pdf"
