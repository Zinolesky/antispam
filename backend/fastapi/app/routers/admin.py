"""Admin router — dashboard stats and number management."""
from datetime import UTC, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SpamNumber, SpamReport, User
from app.routers.auth import _get_current_user
from app.schemas import CategoryCount, DashboardStats, NumberInfo, PaginatedNumbers

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


async def _require_admin(current_user: User = Depends(_get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    """Returns aggregate platform statistics."""
    # Total spam numbers
    total_spam = (await db.execute(
        select(func.count()).select_from(SpamNumber).where(SpamNumber.is_active == True)  # noqa: E712
    )).scalar_one()

    # Total reports
    total_reports = (await db.execute(
        select(func.count()).select_from(SpamReport)
    )).scalar_one()

    # Total users
    total_users = (await db.execute(
        select(func.count()).select_from(User)
    )).scalar_one()

    # Reports today
    today_cutoff = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    reports_today = (await db.execute(
        select(func.count()).select_from(SpamReport).where(SpamReport.created_at >= today_cutoff)
    )).scalar_one()

    # Top categories
    cat_stmt = (
        select(SpamReport.category, func.count().label("cnt"))
        .group_by(SpamReport.category)
        .order_by(func.count().desc())
        .limit(5)
    )
    cat_rows = (await db.execute(cat_stmt)).all()
    top_categories = [CategoryCount(category=r[0], count=r[1]) for r in cat_rows]

    # Recently promoted spam numbers
    recent_stmt = (
        select(SpamNumber)
        .where(SpamNumber.is_active == True)  # noqa: E712
        .order_by(SpamNumber.created_at.desc())
        .limit(10)
    )
    recent_rows = (await db.execute(recent_stmt)).scalars().all()
    recent_promotions = [
        NumberInfo(
            phone_number=n.phone_number,
            is_spam=True,
            spam_score=n.spam_score,
            category=n.category,
            report_count=n.report_count,
            last_reported=n.last_reported,
        )
        for n in recent_rows
    ]

    return DashboardStats(
        total_spam_numbers=total_spam,
        total_reports=total_reports,
        total_users=total_users,
        reports_today=reports_today,
        top_categories=top_categories,
        recent_promotions=recent_promotions,
    )


@router.get("/numbers", response_model=PaginatedNumbers)
async def list_spam_numbers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    offset = (page - 1) * page_size
    stmt = select(SpamNumber).where(SpamNumber.is_active == True)  # noqa: E712
    if category:
        stmt = stmt.where(SpamNumber.category == category)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    rows = (await db.execute(
        stmt.order_by(SpamNumber.report_count.desc()).offset(offset).limit(page_size)
    )).scalars().all()

    items = [
        NumberInfo(
            phone_number=n.phone_number,
            is_spam=True,
            spam_score=n.spam_score,
            category=n.category,
            report_count=n.report_count,
            last_reported=n.last_reported,
        )
        for n in rows
    ]
    return PaginatedNumbers(items=items, total=total, page=page, page_size=page_size)


@router.delete("/numbers/{number_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_spam_number(
    number_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    """Soft-delete a spam number (sets is_active=False, triggers sync delta)."""
    stmt = select(SpamNumber).where(SpamNumber.id == number_id)
    result = await db.execute(stmt)
    number = result.scalar_one_or_none()
    if not number:
        raise HTTPException(status_code=404, detail="Number not found")

    number.is_active = False  # Triggers sync delta via DB trigger
    await db.flush()
