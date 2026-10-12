# AntiSpamApp — Cross-Platform Call Screening Solution

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
