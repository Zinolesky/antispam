"""User personal blocklist & prefix sync router."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, UserBlockList, UserBlockPrefix
from app.routers.auth import _get_current_user
from app.schemas import (
    AddBlockListRequest,
    AddPrefixRequest,
    BlockListSyncRequest,
    BlockListSyncResponse,
    BlockListVersionResponse,
    BlockNumberItem,
    BlockPrefixItem,
)

router = APIRouter(prefix="/api/v1/user/blocklist", tags=["blocklist"])


@router.get("/version", response_model=BlockListVersionResponse)
async def get_user_blocklist_version(
    current_user: User = Depends(_get_current_user),
):
    """Lightweight endpoint for polling cross-device blocklist version changes."""
    return BlockListVersionResponse(version=current_user.blocklist_version or 1)


@router.get("", response_model=BlockListSyncResponse)
async def get_user_blocklist(
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all blocked numbers and prefixes for the authenticated user."""
    # Numbers
    n_stmt = select(UserBlockList).where(UserBlockList.user_id == current_user.id).order_by(UserBlockList.phone_number)
    n_res = await db.execute(n_stmt)
    numbers = [
        BlockNumberItem(phone_number=row.phone_number, label=row.label)
        for row in n_res.scalars().all()
    ]

    # Prefixes
    p_stmt = select(UserBlockPrefix).where(UserBlockPrefix.user_id == current_user.id).order_by(UserBlockPrefix.prefix)
    p_res = await db.execute(p_stmt)
    prefixes = [
        BlockPrefixItem(prefix=row.prefix, label=row.label)
        for row in p_res.scalars().all()
    ]

    return BlockListSyncResponse(
        numbers=numbers,
        prefixes=prefixes,
        version=current_user.blocklist_version or 1,
    )


@router.post("/sync", response_model=BlockListSyncResponse)
async def sync_user_blocklist(
    body: BlockListSyncRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bidirectional sync: merges client-provided numbers & prefixes with cloud DB and returns unified list."""
    # Upsert incoming numbers
    for item in body.numbers:
        clean_num = item.phone_number.strip()
        if clean_num:
            stmt = (
                insert(UserBlockList)
                .values(user_id=current_user.id, phone_number=clean_num, label=item.label)
                .on_conflict_do_nothing(index_elements=["user_id", "phone_number"])
            )
            await db.execute(stmt)

    # Upsert incoming prefixes
    for item in body.prefixes:
        clean_prefix = item.prefix.strip()
        if clean_prefix:
            stmt = (
                insert(UserBlockPrefix)
                .values(user_id=current_user.id, prefix=clean_prefix, label=item.label)
                .on_conflict_do_nothing(index_elements=["user_id", "prefix"])
            )
            await db.execute(stmt)

    current_user.blocklist_version = (current_user.blocklist_version or 1) + 1
    await db.commit()

    # Return unified list
    return await get_user_blocklist(current_user=current_user, db=db)


@router.post("/number", status_code=status.HTTP_201_CREATED)
async def add_block_number(
    body: AddBlockListRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        insert(UserBlockList)
        .values(user_id=current_user.id, phone_number=body.phone_number, label=body.label)
        .on_conflict_do_nothing(index_elements=["user_id", "phone_number"])
    )
    await db.execute(stmt)
    current_user.blocklist_version = (current_user.blocklist_version or 1) + 1
    await db.commit()
    return {"message": "Number blocked successfully", "version": current_user.blocklist_version}


@router.delete("/number/{phone_number}", status_code=status.HTTP_200_OK)
async def remove_block_number(
    phone_number: str,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = delete(UserBlockList).where(
        UserBlockList.user_id == current_user.id,
        UserBlockList.phone_number == phone_number,
    )
    await db.execute(stmt)
    current_user.blocklist_version = (current_user.blocklist_version or 1) + 1
    await db.commit()
    return {"message": "Number removed from block list", "version": current_user.blocklist_version}


@router.post("/prefix", status_code=status.HTTP_201_CREATED)
async def add_block_prefix(
    body: AddPrefixRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        insert(UserBlockPrefix)
        .values(user_id=current_user.id, prefix=body.prefix, label=body.label)
        .on_conflict_do_nothing(index_elements=["user_id", "prefix"])
    )
    await db.execute(stmt)
    current_user.blocklist_version = (current_user.blocklist_version or 1) + 1
    await db.commit()
    return {"message": "Prefix blocked successfully", "version": current_user.blocklist_version}


@router.delete("/prefix/{prefix}", status_code=status.HTTP_200_OK)
async def remove_block_prefix(
    prefix: str,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = delete(UserBlockPrefix).where(
        UserBlockPrefix.user_id == current_user.id,
        UserBlockPrefix.prefix == prefix,
    )
    await db.execute(stmt)
    current_user.blocklist_version = (current_user.blocklist_version or 1) + 1
    await db.commit()
    return {"message": "Prefix removed from block list", "version": current_user.blocklist_version}
