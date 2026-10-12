-- ============================================================
-- AntiSpamApp — Subscription Tier Migration
-- Migration: 003_add_subscription_tier.sql
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT FALSE;
