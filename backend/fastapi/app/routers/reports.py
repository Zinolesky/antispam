"""Spam report submission and lookup router."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SpamReport, User
from app.routers.auth import _get_current_user, _get_optional_current_user
from app.schemas import SpamReportRequest, SpamReportResponse

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])
limiter = Limiter(key_func=get_remote_address)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SpamReportResponse)
@limiter.limit("10/minute")
async def submit_report(
    request: Request,
    body: SpamReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(_get_optional_current_user),
):
    """Submit a spam report for a phone number (logged in or guest)."""
    from datetime import UTC, datetime, timedelta
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    if current_user:
        dup_stmt = (
            select(SpamReport)
            .where(SpamReport.phone_number == body.phone_number)
            .where(SpamReport.reported_by == current_user.id)
            .where(SpamReport.created_at >= cutoff)
        )
        dup = (await db.execute(dup_stmt)).scalar_one_or_none()
        if dup:
            raise HTTPException(
                status_code=429,
                detail="You have already reported this number in the last 24 hours",
            )

    report = SpamReport(
        phone_number=body.phone_number,
        reported_by=current_user.id if current_user else None,
        category=body.category,
        notes=body.notes,
        ip_address=request.client.host if request.client else None,
    )
    db.add(report)
    await db.flush()
    return report


@router.get("/{phone_number}", response_model=list[SpamReportResponse])
async def get_reports(
    phone_number: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_get_current_user),
):
    """Get all reports for a given phone number (authenticated)."""
    stmt = (
        select(SpamReport)
        .where(SpamReport.phone_number == phone_number)
        .order_by(SpamReport.created_at.desc())
        .limit(100)
    )
    result = await db.execute(stmt)
    reports = result.scalars().all()
    return reports
