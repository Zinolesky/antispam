-- ============================================================
-- AntiSpamApp — Blocklist Version & Prefix Sync Migration
-- Migration: 004_add_blocklist_sync.sql
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS blocklist_version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_block_prefixes (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prefix      VARCHAR(20) NOT NULL,
    label       VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, prefix)
);

CREATE INDEX IF NOT EXISTS idx_block_prefixes_user ON user_block_prefixes (user_id);
