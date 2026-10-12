-- ============================================================
-- AntiSpamApp — Seed Spam Numbers
-- Migration: 002_seed_spam_numbers.sql
-- Seeds a representative dataset of known spam numbers
-- (real-world data would be imported from FTC/Hiya CSV export)
-- ============================================================

-- Seed data: well-known spam / robocall numbers (sanitized samples)
-- Source category: 'seed' — these bypass the report-threshold aggregator
INSERT INTO spam_numbers (phone_number, country_code, spam_score, category, report_count, source)
VALUES
    -- Robocallers (US)
    ('+12025551001', 'US', 95, 'robocall',     1200, 'seed'),
    ('+12025551002', 'US', 92, 'robocall',      980, 'seed'),
    ('+18005551003', 'US', 88, 'telemarketer',  750, 'seed'),
    ('+18005551004', 'US', 85, 'telemarketer',  600, 'seed'),
    ('+13105551005', 'US', 78, 'scam',          450, 'seed'),
    ('+13105551006', 'US', 76, 'scam',          420, 'seed'),
    ('+14155551007', 'US', 90, 'robocall',      880, 'seed'),
    ('+14155551008', 'US', 87, 'robocall',      710, 'seed'),
    ('+17135551009', 'US', 82, 'scam',          530, 'seed'),
    ('+17135551010', 'US', 79, 'telemarketer',  390, 'seed'),
    -- UK numbers
    ('+442071231001', 'GB', 88, 'scam',         320, 'seed'),
    ('+442071231002', 'GB', 85, 'telemarketer', 280, 'seed'),
    ('+441614961003', 'GB', 80, 'robocall',     210, 'seed'),
    -- Canada
    ('+14165551001', 'CA', 84, 'robocall',      410, 'seed'),
    ('+16045551002', 'CA', 78, 'telemarketer',  270, 'seed'),
    -- Germany
    ('+4930901820001', 'DE', 82, 'scam',        190, 'seed'),
    ('+4930901820002', 'DE', 75, 'telemarketer',150, 'seed'),
    -- Australia
    ('+61291902001', 'AU', 80, 'robocall',      230, 'seed'),
    ('+61291902002', 'AU', 76, 'scam',          180, 'seed'),
    -- India
    ('+919876540001', 'IN', 92, 'scam',         580, 'seed'),
    ('+919876540002', 'IN', 89, 'robocall',     490, 'seed')
ON CONFLICT (phone_number) DO NOTHING;

-- Mark these as having initial sync_deltas so Go service picks them up
INSERT INTO sync_deltas (operation, phone_number, spam_score, category, is_active)
SELECT 'I', phone_number, spam_score, category, is_active
FROM spam_numbers
WHERE source = 'seed'
ON CONFLICT DO NOTHING;
