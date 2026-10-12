-- ============================================================
-- AntiSpamApp — Initial Schema
-- Migration: 001_initial_schema.sql
-- Runs automatically on first postgres container start
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fast LIKE/ILIKE on number strings

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),           -- NULL for OAuth-only accounts
    display_name    VARCHAR(100),
    oauth_provider  VARCHAR(50),            -- 'google' | NULL
    oauth_sub       VARCHAR(255),           -- provider subject ID
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users (oauth_provider, oauth_sub)
    WHERE oauth_provider IS NOT NULL;

-- ── Refresh Tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);

-- ── Spam Numbers (confirmed) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spam_numbers (
    id              BIGSERIAL PRIMARY KEY,
    phone_number    VARCHAR(20) NOT NULL UNIQUE,  -- E.164 format e.g. +14155552671
    country_code    CHAR(2) NOT NULL,
    spam_score      SMALLINT NOT NULL DEFAULT 50  -- 0-100
                        CHECK (spam_score BETWEEN 0 AND 100),
    category        VARCHAR(50) NOT NULL DEFAULT 'unknown',
                        -- 'robocall' | 'telemarketer' | 'scam' | 'unknown'
    report_count    INT NOT NULL DEFAULT 0,
    source          VARCHAR(50) NOT NULL DEFAULT 'community',
                        -- 'community' | 'seed' | 'ftc'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    first_reported  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reported   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spam_numbers_phone  ON spam_numbers (phone_number);
CREATE INDEX IF NOT EXISTS idx_spam_numbers_active ON spam_numbers (is_active)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_spam_numbers_country ON spam_numbers (country_code);

-- ── Spam Reports (raw community submissions) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS spam_reports (
    id              BIGSERIAL PRIMARY KEY,
    phone_number    VARCHAR(20) NOT NULL,
    reported_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    category        VARCHAR(50) NOT NULL DEFAULT 'unknown',
    notes           TEXT,
    ip_address      INET,
    processed       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spam_reports_phone     ON spam_reports (phone_number);
CREATE INDEX IF NOT EXISTS idx_spam_reports_processed ON spam_reports (processed)
    WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_spam_reports_user      ON spam_reports (reported_by)
    WHERE reported_by IS NOT NULL;

-- ── Personal Block List (per user) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_block_list (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    label       VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_block_list_user ON user_block_list (user_id);

-- ── Call Logs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    phone_number    VARCHAR(20) NOT NULL,
    direction       VARCHAR(10) NOT NULL DEFAULT 'inbound',
    screening_result VARCHAR(20) NOT NULL DEFAULT 'allowed',
                        -- 'allowed' | 'silenced' | 'rejected' | 'skipped'
    spam_score      SMALLINT,
    call_duration_s INT,
    called_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id       VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_call_logs_user   ON call_logs (user_id, called_at DESC)
    WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_number ON call_logs (phone_number);

-- ── Sync Deltas (consumed by Go sync service) ─────────────────────────────────
-- Records every insert/update/delete on spam_numbers for delta streaming.
CREATE TABLE IF NOT EXISTS sync_deltas (
    id              BIGSERIAL PRIMARY KEY,
    operation       CHAR(1) NOT NULL CHECK (operation IN ('I','U','D')),
    phone_number    VARCHAR(20) NOT NULL,
    spam_score      SMALLINT,
    category        VARCHAR(50),
    is_active       BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_deltas_created ON sync_deltas (created_at);
CREATE INDEX IF NOT EXISTS idx_sync_deltas_id      ON sync_deltas (id);

-- ── Trigger: auto-populate sync_deltas on spam_numbers changes ────────────────
CREATE OR REPLACE FUNCTION fn_spam_numbers_sync_delta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO sync_deltas (operation, phone_number, spam_score, category, is_active)
        VALUES ('I', NEW.phone_number, NEW.spam_score, NEW.category, NEW.is_active);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO sync_deltas (operation, phone_number, spam_score, category, is_active)
        VALUES ('U', NEW.phone_number, NEW.spam_score, NEW.category, NEW.is_active);
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO sync_deltas (operation, phone_number, spam_score, category, is_active)
        VALUES ('D', OLD.phone_number, NULL, NULL, FALSE);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_spam_numbers_sync_delta ON spam_numbers;
CREATE TRIGGER trg_spam_numbers_sync_delta
    AFTER INSERT OR UPDATE OR DELETE ON spam_numbers
    FOR EACH ROW EXECUTE FUNCTION fn_spam_numbers_sync_delta();

-- ── Auto-update updated_at timestamps ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_spam_numbers_updated_at
    BEFORE UPDATE ON spam_numbers
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
