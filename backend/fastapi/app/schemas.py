"""Pydantic v2 schemas for request/response validation."""
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# ── Auth ───────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserProfile(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: str
    display_name: Optional[str]
    is_admin: bool
    is_pro: bool = False
    subscription_tier: str = "free"
    created_at: datetime


# ── Reports ────────────────────────────────────────────────────────────────────
E164_REGEX = re.compile(r"^\+[1-9]\d{6,14}$")
VALID_CATEGORIES = {"robocall", "telemarketer", "scam", "unknown"}


class SpamReportRequest(BaseModel):
    phone_number: str
    category: str = "unknown"
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("phone_number")
    @classmethod
    def validate_e164(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-().]", "", v.strip())
        # Support Nigerian numbers: 08162051907 -> +2348162051907
        if cleaned.startswith("0") and len(cleaned) == 11 and cleaned.isdigit():
            cleaned = "+234" + cleaned[1:]
        elif cleaned.startswith("234") and len(cleaned) == 13 and cleaned.isdigit():
            cleaned = "+" + cleaned
        elif not cleaned.startswith("+") and cleaned.isdigit():
            cleaned = "+" + cleaned

        if not E164_REGEX.match(cleaned):
            raise ValueError("phone_number must be in E.164 format (e.g. 08162051907 or +2348162051907)")
        return cleaned

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {VALID_CATEGORIES}")
        return v


class SpamReportResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    phone_number: str
    category: str
    created_at: datetime
    message: str = "Report submitted successfully"


# ── Numbers ────────────────────────────────────────────────────────────────────
class NumberInfo(BaseModel):
    model_config = {"from_attributes": True}

    phone_number: str
    is_spam: bool
    spam_score: Optional[int]
    category: Optional[str]
    report_count: Optional[int]
    last_reported: Optional[datetime]


# ── Admin ──────────────────────────────────────────────────────────────────────
class CategoryCount(BaseModel):
    category: str
    count: int


class DashboardStats(BaseModel):
    total_spam_numbers: int
    total_reports: int
    total_users: int
    reports_today: int
    top_categories: list[CategoryCount]
    recent_promotions: list[NumberInfo]


class PaginatedNumbers(BaseModel):
    items: list[NumberInfo]
    total: int
    page: int
    page_size: int


# ── Block List ─────────────────────────────────────────────────────────────────
class BlockNumberItem(BaseModel):
    phone_number: str
    label: Optional[str] = None

class BlockPrefixItem(BaseModel):
    prefix: str
    label: Optional[str] = None

class BlockListEntry(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    phone_number: str
    label: Optional[str]
    created_at: datetime


class AddBlockListRequest(BaseModel):
    phone_number: str
    label: Optional[str] = None


class AddPrefixRequest(BaseModel):
    prefix: str
    label: Optional[str] = None


class BlockListSyncRequest(BaseModel):
    numbers: list[BlockNumberItem] = []
    prefixes: list[BlockPrefixItem] = []


class BlockListSyncResponse(BaseModel):
    numbers: list[BlockNumberItem]
    prefixes: list[BlockPrefixItem]
