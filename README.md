# HushLine — Cross-Platform Call Screening Solution

A production-grade spam call detection and blocking platform.

```
antispam/
├── mobile/           # React Native (Android) — Call screening UI + JSI SQLite
├── backend/
│   ├── fastapi/      # Python — Auth, Reports, Admin Dashboard
│   └── go-sync/      # Go — High-throughput delta sync & sub-ms lookups
├── infra/            # Docker Compose, Nginx, DB migrations
└── shared/           # OpenAPI spec (source of truth)
```

## Quick Start (Development)

```bash
# 1. Copy env template and fill in values (Google OAuth optional for dev)
cp infra/.env.example infra/.env

# 2. Start all backend services (migrations run automatically on first PG start)
cd infra && docker-compose up -d

# 3. Verify all services are healthy
docker-compose ps

# 4. (Mobile) Requires: Node 18+, JDK 17+, Android SDK API 29+, connected device/emulator
cd mobile && npm install && npm run android
```

## Architecture

```
Incoming Call
     │
     ▼
SpamCallScreeningService.kt (Android Telecom)
     │ queries local SQLite (JSI)
     ▼
On-Device SQLite ──── periodic sync ────▶ Go /sync (delta stream)
                                                │
                                          PostgreSQL + Redis

User reports spam ──▶ FastAPI /reports ──▶ aggregator ──▶ spam_numbers
                                                       ──▶ sync_deltas
```

## Services

| Service | Port | Purpose |
|---|---|---|
| nginx | 80 | Load balancer / reverse proxy |
| fastapi | 8000 | Auth, reports, admin |
| go-sync | 8080 | Delta sync, fast lookups |
| postgres | 5432 | Primary data store |
| redis | 6379 | Bloom filter + session cache |

## Tech Stack

- **Mobile**: React Native (TypeScript), JSI SQLite, Kotlin (Android Telecom)
- **Backend API**: FastAPI (Python 3.12), SQLAlchemy, Alembic, JWT + OAuth2
- **Sync Engine**: Go 1.23, `pgx`, `go-redis`, `net/http`
- **Data**: PostgreSQL 16, Redis 7
- **Infra**: Docker Compose, Nginx

## CI/CD Pipelines (GitHub Actions)

| Workflow | File | Triggers | Purpose |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | Push & PR (`main`, `develop`) | FastAPI lint/migrations/pytest, Go Sync `go vet` & race tests, OpenAPI 3.1 validation, Mobile TS/ESLint/Jest checks, and full Docker Compose E2E smoke test |
| **CD — Backend** | `.github/workflows/cd-backend.yml` | Push (`main`), tags (`v*.*.*`), manual | Builds & pushes `antispam-fastapi` and `antispam-go-sync` images to GHCR (`ghcr.io`), with optional SSH production deployment |
| **CD — Android** | `.github/workflows/cd-mobile-android.yml` | Push (`main`), tags (`v*.*.*`), manual | Builds Android Release APK & Google Play App Bundle (`.aab`), uploads artifacts, and publishes GitHub Releases on version tags |
| **CD — Legal Portal** | `.github/workflows/pages.yml` | Push (`main` `docs/**`), manual | Deploys `docs/` (Privacy Policy, Terms of Service, Account Deletion portal) to GitHub Pages |
| **Dependabot** | `.github/dependabot.yml` | Weekly schedule | Automated dependency updates for GitHub Actions, pip, Go modules, npm, Gradle, and Docker |

### Optional Repository Secrets & Variables

- **Android Production Signing** (`cd-mobile-android.yml` — falls back to debug keystore if omitted):
  - `ANDROID_KEYSTORE_BASE64`: Base64-encoded upload keystore (`base64 -w 0 my-upload-key.keystore`)
  - `ANDROID_KEYSTORE_PASSWORD`: Keystore password
  - `ANDROID_KEY_ALIAS`: Upload key alias
  - `ANDROID_KEY_PASSWORD`: Upload key password
- **Production SSH Deployment** (`cd-backend.yml` — enabled when repository variable `ENABLE_SSH_DEPLOY=true`):
  - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, and optional variable `DEPLOY_PATH` (defaults to `/opt/antispam`)
