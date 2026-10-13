-- =========================================================
--  Migration 005 : mot de passe oublié
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- Liens de réinitialisation : à usage unique, valables 30 minutes, jeton jamais stocké en clair
CREATE TABLE IF NOT EXISTS password_resets (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL,          -- empreinte SHA-256 du jeton envoyé par e-mail
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  requested_ip  VARCHAR(64),                -- traçabilité en cas d'abus
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_password_reset_token UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at DESC);

-- Date du dernier changement de mot de passe : les sessions ouvertes AVANT sont refusées
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
