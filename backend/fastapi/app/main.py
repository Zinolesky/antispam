"""FastAPI application entry point."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings
from app.database import close_redis
from app.routers import admin, auth, blocklist, numbers, reports
from app.tasks.aggregator import start_aggregator_loop

settings = get_settings()
logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)

# ── Rate limiter ───────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AntiSpamApp FastAPI starting up...")
    # Start background aggregator (runs every 60s)
    agg_task = asyncio.create_task(start_aggregator_loop(interval_seconds=60))
    yield
    # Shutdown
    agg_task.cancel()
    await close_redis()
    logger.info("AntiSpamApp FastAPI shut down")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AntiSpamApp API",
    version="1.0.0",
    description="Spam call screening platform — Auth, Reports, Admin",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS (tighten in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if not settings.is_production else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(numbers.router)
app.include_router(admin.router)
app.include_router(blocklist.router)


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "fastapi"}


# ── Global error handler ───────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
    )
