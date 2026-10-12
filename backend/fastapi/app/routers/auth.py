"""Auth router — email/password registration/login + Google OAuth2."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from app.auth.oauth import build_google_auth_url, exchange_google_code
from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserProfile,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
settings = get_settings()

# ── Dependency: current user with db ──────────────────────────────────────────
async def _get_current_user(
    credentials=Depends(__import__("app.auth.jwt", fromlist=["bearer_scheme"]).bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    from app.auth.jwt import decode_access_token
    from jose import JWTError

    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise exc
    try:
        payload = decode_access_token(credentials.credentials)
        user_id: str = payload.get("sub")
    except JWTError:
        raise exc

    stmt = select(User).where(User.id == uuid.UUID(user_id)).where(User.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise exc
    return user


async def _get_optional_current_user(
    credentials=Depends(__import__("app.auth.jwt", fromlist=["bearer_scheme"]).bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        from app.auth.jwt import decode_access_token
        payload = decode_access_token(credentials.credentials)
        user_id: str | None = payload.get("sub")
        if not user_id:
            return None
        stmt = select(User).where(User.id == uuid.UUID(user_id)).where(User.is_active == True)  # noqa: E712
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    except Exception:
        return None


def _make_token_response(access_token: str, refresh_token: str) -> TokenResponse:
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Email/Password Registration ────────────────────────────────────────────────
@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == body.email)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        # If user signed in via OAuth (e.g. Google) previously without a password, allow linking/setting password
        if not existing.hashed_password:
            existing.hashed_password = hash_password(body.password)
            if body.display_name and not existing.display_name:
                existing.display_name = body.display_name
            await db.flush()
            access = create_access_token(existing.id)
            refresh = await create_refresh_token(db, existing.id)
            return _make_token_response(access, refresh)
        raise HTTPException(status_code=409, detail="Email already registered. Please sign in.")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    await db.flush()

    access = create_access_token(user.id)
    refresh = await create_refresh_token(db, user.id)
    return _make_token_response(access, refresh)


# ── Email/Password Login ───────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == body.email).where(User.is_active == True)  # noqa: E712
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.hashed_password:
        # User registered with Google previously without a password.
        # Seamlessly set this as their password so they can now sign in either way!
        user.hashed_password = hash_password(body.password)
        await db.flush()
    elif not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    access = create_access_token(user.id)
    refresh = await create_refresh_token(db, user.id)
    return _make_token_response(access, refresh)


# ── Refresh Token Rotation ─────────────────────────────────────────────────────
@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        user, new_refresh = await rotate_refresh_token(db, body.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    access = create_access_token(user.id)
    return _make_token_response(access, new_refresh)


# ── Logout ─────────────────────────────────────────────────────────────────────
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_get_current_user),
):
    await revoke_refresh_token(db, body.refresh_token)


# ── Profile ────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserProfile)
async def me(current_user: User = Depends(_get_current_user)):
    return current_user


# ── Delete Account (In-App Authenticated) ──────────────────────────────────────
@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_my_account(
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently deletes user account, custom blocklists, prefix rules, and refresh tokens.
    """
    await db.delete(current_user)
    await db.commit()
    return {"status": "ok", "message": "Account and all associated personal data permanently deleted."}


# ── Delete Account Request (Public Web Form) ───────────────────────────────────
class WebAccountDeletionRequest(BaseModel):
    email: str
    password: Optional[str] = None
    confirm: bool = True

@router.post("/delete-account-request", status_code=status.HTTP_200_OK)
async def request_account_deletion_web(
    body: WebAccountDeletionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Public web deletion endpoint for users requesting account erasure outside the app.
    """
    stmt = select(User).where(User.email == body.email.strip().lower())
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        # Prevent email enumeration: return standard success message
        return {
            "status": "ok",
            "message": f"If an account exists for {body.email}, it has been scheduled and processed for permanent deletion.",
        }

    # If account has a password and password was provided, verify it; otherwise delete user
    if user.hashed_password and body.password:
        if not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect account password.")

    await db.delete(user)
    await db.commit()
    return {
        "status": "ok",
        "message": f"Account for {body.email} and all associated cloud rules have been permanently deleted.",
    }


# ── Google OAuth2 — Initiate ───────────────────────────────────────────────────
@router.get("/oauth/google")
async def google_login(format: Optional[str] = None):
    auth_url, _ = build_google_auth_url()
    if format == "json":
        return {"auth_url": auth_url}
    return RedirectResponse(url=auth_url)


# ── Google OAuth2 — Callback ───────────────────────────────────────────────────
@router.get("/oauth/google/callback")
async def google_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import HTMLResponse

    user_info = await exchange_google_code(code, state)

    email = user_info.get("email")
    sub = user_info.get("sub")
    if not email or not sub:
        raise HTTPException(status_code=400, detail="Invalid user info from Google")

    # Upsert user
    stmt = select(User).where(User.email == email)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user is None:
        user = User(
            email=email,
            display_name=user_info.get("name"),
            oauth_provider="google",
            oauth_sub=sub,
        )
        db.add(user)
        await db.flush()
    elif not user.oauth_sub:
        user.oauth_provider = "google"
        user.oauth_sub = sub
        await db.flush()

    access = create_access_token(user.id)
    refresh = await create_refresh_token(db, user.id)

    deep_link = f"antispam://auth?access_token={access}&refresh_token={refresh}"
    intent_link = f"intent://auth?access_token={access}&refresh_token={refresh}#Intent;scheme=antispam;package=com.antispamapp;end"
    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connected to AntiSpam</title>
</head>
<body style="background:#0D0D1A; color:#FFFFFF; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; padding:20px;">
  <div style="font-size:48px; margin-bottom:12px;">🛡️</div>
  <h2 style="color:#2ED573; margin:0 0 8px;">Signed in with Google!</h2>
  <p style="color:#8A8AAA; font-size:14px; margin:0 0 24px;">Returning to AntiSpamApp...</p>
  <a id="btn" href="{deep_link}" style="background:#7C6FF7; color:#FFFFFF; text-decoration:none; font-weight:700; padding:14px 28px; border-radius:12px; font-size:15px; display:inline-block;">Open AntiSpamApp</a>
  <script>
    function redirect() {{
      window.location.href = "{deep_link}";
      setTimeout(function() {{
        window.location.href = "{intent_link}";
      }}, 500);
    }}
    setTimeout(redirect, 200);
    document.getElementById('btn').onclick = function(e) {{
      window.location.href = "{deep_link}";
    }};
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)
