-- =========================================================
--  Migration 002 : notifications (centre de notifications + push)
--  Sans perte de données, rejouable sans erreur :
--    npm run db:sql -- database/migrations/002_notifications.sql
-- =========================================================

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'NEW_MESSAGE',         -- nouveau message dans une conversation
    'NEW_RESERVATION',     -- (propriétaire) un client a réservé sur son voyage
    'RESERVATION_STATUS',  -- étape du colis : confirmée, reçue, en vol, arrivée, livrée, annulée
    'TRIP_CANCELLED',      -- (client) le voyage de sa réservation est annulé
    'TRAVELER_APPROVED',   -- (voyageur) compte approuvé
    'TRAVELER_PENDING'     -- (admin) nouvelle demande de compte voyageur
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------
-- Centre de notifications (comptes uniquement)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         notification_type NOT NULL,
  title        VARCHAR(160) NOT NULL,
  body         VARCHAR(500) NOT NULL DEFAULT '',
  link         VARCHAR(255),              -- page à ouvrir : /messages/12, /admin/approbations…
  group_key    VARCHAR(80),               -- ex. 'conversation:12' : regroupe tout ce qui concerne une réservation
  event_count  INT NOT NULL DEFAULT 1,    -- nombre d'événements regroupés (ex. 3 messages)
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- Une seule notification NON LUE par groupe et par personne : les événements suivants la mettent à jour
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_unread_group
  ON notifications(user_id, group_key)
  WHERE read_at IS NULL AND group_key IS NOT NULL;

-- ---------------------------------------------------------
-- Abonnements push (un par appareil / navigateur)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,          -- URL du service de push du navigateur (Google, Apple, Mozilla…)
  p256dh        TEXT NOT NULL,          -- clés de chiffrement du navigateur
  auth          TEXT NOT NULL,
  user_agent    VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  CONSTRAINT uq_push_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
