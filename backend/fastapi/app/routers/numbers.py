"""Number lookup router — single number spam check (FastAPI fallback)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SpamNumber, User
from app.routers.auth import _get_current_user
from app.schemas import E164_REGEX, NumberInfo

router = APIRouter(prefix="/api/v1/numbers", tags=["numbers"])


@router.get("/check", response_model=NumberInfo)
async def check_number(
    number: str = Query(..., description="E.164 phone number e.g. +14155552671"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_get_current_user),
):
    """Single number lookup against PostgreSQL. Use Go /lookup for sub-ms speed."""
    if not E164_REGEX.match(number):
        raise HTTPException(status_code=400, detail="Invalid E.164 phone number format")

    stmt = select(SpamNumber).where(SpamNumber.phone_number == number).where(SpamNumber.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    spam = result.scalar_one_or_none()

    if spam:
        return NumberInfo(
            phone_number=spam.phone_number,
            is_spam=True,
            spam_score=spam.spam_score,
            category=spam.category,
            report_count=spam.report_count,
            last_reported=spam.last_reported,
        )

    return NumberInfo(
        phone_number=number,
        is_spam=False,
        spam_score=None,
        category=None,
        report_count=0,
        last_reported=None,
    )
