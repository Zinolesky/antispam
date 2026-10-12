"""Background aggregator: promotes frequently-reported numbers to spam_numbers."""
import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import SpamNumber, SpamReport

logger = logging.getLogger(__name__)
settings = get_settings()


async def run_aggregation() -> int:
    """
    Finds unprocessed spam reports grouped by phone number.
    Any number with >= SPAM_REPORT_THRESHOLD unprocessed reports gets promoted
    to (or updated in) spam_numbers. Returns count of numbers promoted.
    """
    promoted = 0
    async with AsyncSessionLocal() as db:
        try:
            # Group unprocessed reports by number, find those above threshold
            stmt = (
                select(
                    SpamReport.phone_number,
                    func.count().label("report_count"),
                    func.mode().within_group(SpamReport.category).label("top_category"),
                )
                .where(SpamReport.processed == False)  # noqa: E712
                .group_by(SpamReport.phone_number)
                .having(func.count() >= settings.SPAM_REPORT_THRESHOLD)
            )
            rows = (await db.execute(stmt)).all()

            for row in rows:
                phone_number, count, category = row.phone_number, row.report_count, row.top_category
                country_code = _extract_country_code(phone_number)

                # Upsert into spam_numbers
                existing_stmt = select(SpamNumber).where(SpamNumber.phone_number == phone_number)
                existing = (await db.execute(existing_stmt)).scalar_one_or_none()

                if existing:
                    existing.report_count += count
                    existing.last_reported = datetime.now(UTC)
                    existing.category = category or existing.category
                    existing.spam_score = min(100, 50 + existing.report_count * 2)
                    existing.is_active = True
                else:
                    spam_score = min(100, 50 + count * 2)
                    new_number = SpamNumber(
                        phone_number=phone_number,
                        country_code=country_code,
                        spam_score=spam_score,
                        category=category or "unknown",
                        report_count=count,
                        source="community",
                    )
                    db.add(new_number)
                    promoted += 1

                # Mark reports as processed
                await db.execute(
                    update(SpamReport)
                    .where(SpamReport.phone_number == phone_number)
                    .where(SpamReport.processed == False)  # noqa: E712
                    .values(processed=True)
                )

            await db.commit()
            if promoted > 0:
                logger.info(f"Aggregator promoted {promoted} new spam numbers")
        except Exception as e:
            logger.error(f"Aggregator error: {e}")
            await db.rollback()

    return promoted


def _extract_country_code(phone_number: str) -> str:
    """Naive E.164 country code extraction by prefix matching."""
    prefixes = {
        "+1": "US", "+44": "GB", "+49": "DE", "+61": "AU",
        "+33": "FR", "+39": "IT", "+34": "ES", "+81": "JP",
        "+86": "CN", "+91": "IN", "+55": "BR", "+52": "MX",
        "+7": "RU", "+82": "KR", "+65": "SG", "+27": "ZA",
    }
    for prefix, code in sorted(prefixes.items(), key=lambda x: -len(x[0])):
        if phone_number.startswith(prefix):
            return code
    return "XX"


async def start_aggregator_loop(interval_seconds: int = 60) -> None:
    """Runs the aggregator on a fixed interval. Called from app startup."""
    logger.info(f"Aggregator started (interval={interval_seconds}s, threshold={settings.SPAM_REPORT_THRESHOLD})")
    while True:
        await asyncio.sleep(interval_seconds)
        await run_aggregation()
