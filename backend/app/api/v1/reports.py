# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Reports API (Section 2.2): account analytics + branded per-campaign PDF."""
from __future__ import annotations

import io
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.account import Account
from app.schemas.report import ReportSummary
from app.services import campaign_service
from app.services.reports import analytics, pdf

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportSummary)
async def summary(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = "30d",
) -> ReportSummary:
    return await analytics.account_summary(db, user.account_id, period)


@router.get("/campaigns/{campaign_id}/pdf")
async def campaign_pdf(
    campaign_id: UUID,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    account = await db.get(Account, user.account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found.")
    try:
        data = await pdf.campaign_report_pdf(db, campaign, account)
    except (ImportError, OSError) as exc:  # WeasyPrint python or native libs missing
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "PDF rendering is unavailable on this server.",
        ) from exc
    filename = pdf.report_filename(campaign.id, campaign.name)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
