-- =========================================================
--  Migration 001 : le téléphone sert d'identifiant de connexion, il doit être unique
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT uq_users_phone UNIQUE (phone);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; -- déjà en place
END $$;
