-- =========================================================
--  Migration 003 : preuve d'acceptation des CGU et de la politique de confidentialité
--    npm run db:sql -- database/migrations/003_terms.sql
-- =========================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;   -- date d'acceptation à l'inscription
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version     VARCHAR(20);   -- version acceptée (ex. '2026-10')
