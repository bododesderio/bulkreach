"""Branded client-success PDF for a completed campaign (Section 2.2).

Renders an HTML template to PDF via WeasyPrint. WeasyPrint pulls in native
libraries (cairo/pango), so it is imported lazily — the module stays importable
even where those libs are absent, and only /report.pdf requires them.
"""
from __future__ import annotations

import html
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.campaign import Campaign
from app.services import campaign_service

_BRAND_TEAL = "#0d9488"
_BRAND_NAVY = "#0f172a"


def _esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))


def _fmt_dt(dt: datetime | None) -> str:
    return dt.strftime("%d %b %Y, %H:%M") if dt else "—"


def _stat_card(label: str, value: str, tone: str = _BRAND_NAVY) -> str:
    return f"""
      <div class="stat">
        <div class="stat-value" style="color:{tone}">{_esc(value)}</div>
        <div class="stat-label">{_esc(label)}</div>
      </div>"""


def _render_html(campaign: Campaign, account: Account, stats: dict) -> str:
    delivered = stats["sent"]
    failed = stats["failed"]
    rate = stats["delivery_rate"]
    generated = _fmt_dt(datetime.now(timezone.utc))

    logo = (
        f'<img src="{_esc(account.logo_url)}" class="logo" alt="logo" />'
        if account.logo_url
        else f'<div class="logo-fallback">{_esc(account.name[:1].upper())}</div>'
    )

    channel_rows = ""
    if campaign.type in ("sms", "both"):
        channel_rows += (
            f"<tr><td>SMS</td><td>{stats['sms_sent']:,}</td>"
            f"<td>{stats['sms_failed']:,}</td></tr>"
        )
    if campaign.type in ("email", "both"):
        channel_rows += (
            f"<tr><td>Email</td><td>{stats['email_sent']:,}</td>"
            f"<td>{stats['email_failed']:,}</td></tr>"
        )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page {{ size: A4; margin: 20mm 18mm; }}
  * {{ font-family: 'Helvetica Neue', Arial, sans-serif; }}
  body {{ color: {_BRAND_NAVY}; font-size: 11px; }}
  .header {{ display: flex; justify-content: space-between; align-items: center;
            border-bottom: 3px solid {_BRAND_TEAL}; padding-bottom: 14px; }}
  .brand {{ font-size: 20px; font-weight: 800; color: {_BRAND_NAVY}; }}
  .brand small {{ display:block; font-size: 10px; font-weight: 500; color:#64748b; }}
  .logo {{ height: 44px; }}
  .logo-fallback {{ height: 44px; width: 44px; border-radius: 10px; background: {_BRAND_TEAL};
                   color: #fff; font-weight: 800; font-size: 22px; text-align:center; line-height:44px; }}
  h1 {{ font-size: 22px; margin: 28px 0 2px; }}
  .subtitle {{ color:#64748b; font-size: 12px; margin-bottom: 22px; }}
  .stats {{ display: flex; gap: 12px; margin: 18px 0 26px; }}
  .stat {{ flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align:center; }}
  .stat-value {{ font-size: 24px; font-weight: 800; }}
  .stat-label {{ font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color:#64748b; margin-top:4px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th, td {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }}
  th {{ font-size: 9px; text-transform: uppercase; letter-spacing:.5px; color:#64748b; }}
  .section-title {{ font-size: 13px; font-weight: 700; margin: 26px 0 4px; }}
  .meta td:first-child {{ color:#64748b; width: 40%; }}
  .footer {{ margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0;
            font-size: 9px; color:#94a3b8; text-align:center; }}
</style></head><body>
  <div class="header">
    <div class="brand">{_esc(account.name)}<small>Campaign report · powered by BulkReach</small></div>
    {logo}
  </div>

  <h1>{_esc(campaign.name)}</h1>
  <div class="subtitle">{_esc(campaign.type.upper())} campaign · {stats['total']:,} recipients</div>

  <div class="stats">
    {_stat_card("Delivered", f"{delivered:,}", _BRAND_TEAL)}
    {_stat_card("Failed", f"{failed:,}", "#dc2626")}
    {_stat_card("Delivery rate", f"{rate}%")}
  </div>

  <div class="section-title">Channel breakdown</div>
  <table>
    <tr><th>Channel</th><th>Delivered</th><th>Failed</th></tr>
    {channel_rows}
  </table>

  <div class="section-title">Campaign details</div>
  <table class="meta">
    <tr><td>Status</td><td>{_esc(campaign.status.capitalize())}</td></tr>
    <tr><td>Created</td><td>{_fmt_dt(campaign.created_at)}</td></tr>
    <tr><td>Completed</td><td>{_fmt_dt(campaign.completed_at)}</td></tr>
    <tr><td>Recipients</td><td>{stats['total']:,}</td></tr>
  </table>

  <div class="footer">
    Generated {generated} · This report reflects delivery attempts recorded by BulkReach.
  </div>
</body></html>"""


async def campaign_report_pdf(
    db: AsyncSession, campaign: Campaign, account: Account
) -> bytes:
    """Render a completed campaign's branded PDF. Returns raw PDF bytes."""
    from weasyprint import HTML  # lazy — native deps only needed here

    stats = await campaign_service.compute_stats(db, campaign.id)
    document = _render_html(campaign, account, stats)
    return HTML(string=document).write_pdf()


def report_filename(campaign_id: uuid.UUID, name: str) -> str:
    slug = "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")[:40]
    return f"bulkreach-report-{slug or campaign_id}.pdf"
