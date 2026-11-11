"""FastAPI Backend Unit & API Tests."""
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from jose import JWTError
from pydantic import ValidationError

from app.auth.jwt import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.main import app
from app.models import SpamNumber, User
from app.routers.auth import _get_current_user
from app.schemas import SpamReportRequest
from app.tasks.aggregator import _extract_country_code


# ── Password & JWT Unit Tests ──────────────────────────────────────────────────


def test_password_hashing_and_verification():
    raw = "S3cur3P@ssw0rd!"
    hashed = hash_password(raw)
    assert hashed != raw
    assert verify_password(raw, hashed) is True
    assert verify_password("WrongPassword123", hashed) is False


def test_jwt_create_and_decode():
    user_id = uuid.uuid4()
    token = create_access_token(user_id, extra={"role": "user"})
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "access"
    assert payload["role"] == "user"


def test_jwt_rejects_invalid_token():
    with pytest.raises(JWTError):
        decode_access_token("invalid.jwt.token")


# ── Schema Validation Tests ────────────────────────────────────────────────────


def test_spam_report_schema_normalizes_nigerian_and_e164():
    r1 = SpamReportRequest(phone_number="08162051907", category="scam")
    assert r1.phone_number == "+2348162051907"
    assert r1.category == "scam"

    r2 = SpamReportRequest(phone_number="2348162051907", category="robocall")
    assert r2.phone_number == "+2348162051907"

    r3 = SpamReportRequest(phone_number="+1 (415) 555-2671", category="telemarketer")
    assert r3.phone_number == "+14155552671"


def test_spam_report_schema_rejects_invalid_input():
    with pytest.raises(ValidationError):
        SpamReportRequest(phone_number="123", category="scam")

    with pytest.raises(ValidationError):
        SpamReportRequest(phone_number="+14155552671", category="invalid_cat")


# ── Aggregator Helper Tests ────────────────────────────────────────────────────


def test_extract_country_code():
    assert _extract_country_code("+14155552671") == "US"
    assert _extract_country_code("+442071231001") == "GB"
    assert _extract_country_code("+4930901820001") == "DE"
    assert _extract_country_code("+919876540001") == "IN"
    assert _extract_country_code("+2348162051907") == "XX"


# ── HTTP Endpoint Tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "fastapi"}


@pytest.mark.asyncio
async def test_authenticated_me_and_blocklist_version():
    fake_user = User(
        id=uuid.uuid4(),
        email="ci@antispam.dev",
        display_name="CI Runner",
        is_active=True,
        is_admin=False,
        is_pro=True,
        subscription_tier="pro",
        blocklist_version=4,
        created_at=datetime.now(UTC),
    )

    app.dependency_overrides[_get_current_user] = lambda: fake_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            me_resp = await client.get("/api/v1/auth/me")
            assert me_resp.status_code == 200
            data = me_resp.json()
            assert data["email"] == "ci@antispam.dev"
            assert data["subscription_tier"] == "pro"

            ver_resp = await client.get("/api/v1/user/blocklist/version")
            assert ver_resp.status_code == 200
            assert ver_resp.json() == {"version": 4}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_numbers_check_endpoint():
    fake_user = User(
        id=uuid.uuid4(),
        email="checker@antispam.dev",
        display_name="Checker",
        is_active=True,
        is_admin=False,
        created_at=datetime.now(UTC),
    )
    fake_spam = SpamNumber(
        id=1,
        phone_number="+12025551001",
        country_code="US",
        spam_score=95,
        category="robocall",
        report_count=1200,
        source="seed",
        is_active=True,
        last_reported=datetime.now(UTC),
    )

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = fake_spam
    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[_get_current_user] = lambda: fake_user
    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/numbers/check?number=%2B12025551001")
            assert resp.status_code == 200
            body = resp.json()
            assert body["is_spam"] is True
            assert body["spam_score"] == 95
            assert body["category"] == "robocall"

            bad_resp = await client.get("/api/v1/numbers/check?number=invalid")
            assert bad_resp.status_code == 400
    finally:
        app.dependency_overrides.clear()
