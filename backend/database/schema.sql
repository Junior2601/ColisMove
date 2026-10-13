-- =========================================================
--  MoveColis — Schéma PostgreSQL (v2 : messagerie intégrée)
--  ⚠️ Ce script SUPPRIME puis recrée toutes les tables.
--     À utiliser en développement uniquement.
-- =========================================================

DROP TABLE IF EXISTS job_runs, marketing_queue, campaigns, route_interests, push_subscriptions, notifications, messages, conversations, tracking_events, reservations, trips, settings, users CASCADE;
DROP TYPE  IF EXISTS marketing_status, campaign_audience, campaign_status, interest_source, notification_type, message_sender, reservation_status, trip_status, user_status, user_role CASCADE;
DROP FUNCTION IF EXISTS set_updated_at, touch_conversation, city_key CASCADE;

-- ---------------------------------------------------------
-- Types énumérés (statuts contrôlés par la BD, pas par le code)
-- ---------------------------------------------------------
CREATE TYPE user_role   AS ENUM ('ADMIN', 'VOYAGEUR', 'CLIENT');
CREATE TYPE user_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE trip_status AS ENUM ('PUBLISHED', 'COMPLETED', 'CANCELLED');
CREATE TYPE reservation_status AS ENUM (
  'PENDING',     -- réservée, en attente de confirmation par le propriétaire (via la messagerie)
  'CONFIRMED',   -- confirmée par le propriétaire du voyage
  'RECEIVED',    -- colis remis au voyageur
  'IN_TRANSIT',  -- en vol
  'ARRIVED',     -- arrivé à destination
  'DELIVERED',   -- remis au destinataire
  'CANCELLED'
);
-- Qui a écrit un message, du point de vue de la conversation
CREATE TYPE message_sender AS ENUM (
  'CUSTOMER',    -- client connecté ou visiteur (celui qui a réservé)
  'OWNER',       -- propriétaire du voyage (voyageur ou admin)
  'ADMIN',       -- admin qui intervient sur un voyage qui n'est pas le sien
  'SYSTEM'       -- message automatique (changement de statut…)
);

-- ---------------------------------------------------------
-- Utilisateurs (admin, voyageurs, clients)
-- Les visiteurs n'ont pas de compte : ils réservent avec nom + téléphone
-- ---------------------------------------------------------
CREATE TABLE users (
  id                SERIAL PRIMARY KEY,
  first_name        VARCHAR(80)  NOT NULL,
  last_name         VARCHAR(80)  NOT NULL,
  email             VARCHAR(160) NOT NULL,
  password_hash     TEXT         NOT NULL,
  phone             VARCHAR(20)  NOT NULL,   -- international, chiffres uniquement (ex. 2250712345678), unique
  city              VARCHAR(80),             -- ville de résidence (voyageur)
  role              user_role    NOT NULL DEFAULT 'CLIENT',
  status            user_status  NOT NULL DEFAULT 'APPROVED', -- PENDING pour les voyageurs à l'inscription
  status_changed_at TIMESTAMPTZ,             -- date d'approbation / de refus (affichée côté admin)
  terms_accepted_at TIMESTAMPTZ,             -- acceptation des CGU et de la politique de confidentialité
  terms_version     VARCHAR(20),             -- version acceptée (ex. '2026-10')
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_users_email      UNIQUE (email),
  CONSTRAINT uq_users_phone      UNIQUE (phone),          -- on peut aussi se connecter avec son numéro
  CONSTRAINT chk_email_lowercase CHECK (email = LOWER(email)),
  CONSTRAINT chk_users_phone     CHECK (phone ~ '^[0-9]{8,15}$')
);

CREATE INDEX idx_users_role_status ON users(role, status);

-- ---------------------------------------------------------
-- Voyages
-- Les dates sont en heure LOCALE de chaque ville (comme sur un billet d'avion) :
-- TIMESTAMP sans fuseau, pour que "08:45 à Abidjan" reste "08:45" quel que soit le pays du lecteur.
-- ---------------------------------------------------------
CREATE TABLE trips (
  id               SERIAL PRIMARY KEY,
  owner_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  departure_city   VARCHAR(80)  NOT NULL,
  departure_at     TIMESTAMP    NOT NULL,     -- date + heure locales de départ
  stop_city        VARCHAR(80),               -- NULL si vol direct
  stop_duration    VARCHAR(20),               -- ex. '3h20'
  arrival_city     VARCHAR(80)  NOT NULL,
  arrival_at       TIMESTAMP    NOT NULL,     -- date + heure locales d'arrivée

  kilos_total      NUMERIC(6,2)  NOT NULL CHECK (kilos_total > 0),
  kilos_reserved   NUMERIC(6,2)  NOT NULL DEFAULT 0,
  price_per_kilo   NUMERIC(12,2) NOT NULL CHECK (price_per_kilo >= 0),
  currency         VARCHAR(3)    NOT NULL DEFAULT 'XOF' CHECK (currency ~ '^[A-Z]{3}$'),

  status           trip_status  NOT NULL DEFAULT 'PUBLISHED',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_arrival_after_departure CHECK (arrival_at > departure_at),
  CONSTRAINT chk_reserved_positive       CHECK (kilos_reserved >= 0),
  CONSTRAINT chk_reserved_lte_total      CHECK (kilos_reserved <= kilos_total),
  CONSTRAINT chk_stop_consistency        CHECK (
    (stop_city IS NULL AND stop_duration IS NULL) OR
    (stop_city IS NOT NULL AND stop_duration IS NOT NULL)
  )
);

CREATE INDEX idx_trips_owner      ON trips(owner_id);
CREATE INDEX idx_trips_departure  ON trips(departure_at);
CREATE INDEX idx_trips_status     ON trips(status);
CREATE INDEX idx_trips_cities     ON trips(departure_city, arrival_city);

-- ---------------------------------------------------------
-- Réservations
-- client_id NULL = réservation faite par un visiteur (sans compte)
-- ---------------------------------------------------------
CREATE TABLE reservations (
  id                 SERIAL PRIMARY KEY,
  tracking_code      VARCHAR(20) NOT NULL,          -- MC-YYYYMMDD-XXXX
  trip_id            INT NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
  client_id          INT REFERENCES users(id) ON DELETE SET NULL,

  -- Infos saisies dans le formulaire (même pour un client connecté, on fige)
  client_name        VARCHAR(160) NOT NULL,
  client_phone       VARCHAR(20)  NOT NULL,
  parcel_description TEXT,

  kilos              NUMERIC(6,2)  NOT NULL CHECK (kilos > 0),
  price_per_kilo     NUMERIC(12,2) NOT NULL,        -- figé au moment de la réservation
  total_amount       NUMERIC(14,2) NOT NULL,        -- calculé côté serveur : kilos * price_per_kilo
  currency           VARCHAR(3)    NOT NULL,

  status             reservation_status NOT NULL DEFAULT 'PENDING',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_reservations_tracking_code UNIQUE (tracking_code),
  CONSTRAINT chk_reservations_phone        CHECK (client_phone ~ '^[0-9]{8,15}$'),
  CONSTRAINT chk_total_amount              CHECK (total_amount = ROUND(kilos * price_per_kilo, 2))
);

CREATE INDEX idx_reservations_trip    ON reservations(trip_id);
CREATE INDEX idx_reservations_client  ON reservations(client_id);
CREATE INDEX idx_reservations_status  ON reservations(status);
CREATE INDEX idx_reservations_created ON reservations(created_at);

-- ---------------------------------------------------------
-- Historique de suivi (une ligne par changement de statut)
-- C'est ce qui alimente la timeline de la page Suivi
-- ---------------------------------------------------------
CREATE TABLE tracking_events (
  id              SERIAL PRIMARY KEY,
  reservation_id  INT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  status          reservation_status NOT NULL,
  note            VARCHAR(255),           -- ex. 'Escale Istanbul', 'Remis à Abidjan'
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracking_reservation ON tracking_events(reservation_id, created_at);

-- ---------------------------------------------------------
-- Messagerie : une conversation par réservation
-- (client ou visiteur) ↔ (propriétaire du voyage). L'admin peut lire et intervenir partout.
-- ---------------------------------------------------------
CREATE TABLE conversations (
  id                    SERIAL PRIMARY KEY,
  reservation_id        INT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  guest_token_hash      CHAR(64),        -- SHA-256 du jeton d'accès d'un visiteur (jamais stocké en clair)
  owner_last_read_at    TIMESTAMPTZ,     -- dernier passage du propriétaire → calcul des non-lus
  customer_last_read_at TIMESTAMPTZ,     -- dernier passage du client / visiteur
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_conversations_reservation UNIQUE (reservation_id)
);

CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type     message_sender NOT NULL,
  sender_id       INT REFERENCES users(id) ON DELETE SET NULL,  -- NULL : visiteur ou message système
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_message_body CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, id);

-- ---------------------------------------------------------
-- Notifications (identique à database/migrations/002_notifications.sql)
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- Paramètres de la plateforme (une seule ligne, id = 1)
-- Le modèle de message sert de PREMIER message envoyé automatiquement
-- dans la conversation à la création d'une réservation.
-- ---------------------------------------------------------
CREATE TABLE settings (
  id                           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  support_whatsapp             VARCHAR(20) CHECK (support_whatsapp ~ '^[0-9]{8,15}$'), -- contact support, optionnel
  reservation_message_template TEXT NOT NULL DEFAULT
    'Bonjour ! Je viens de réserver {kilos} kg sur votre voyage {trajet} du {date}. Nom : {nom}. Code de suivi : {code}.',
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (1);

-- ---------------------------------------------------------
-- Trigger : mise à jour automatique de updated_at
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trips_updated_at        BEFORE UPDATE ON trips        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settings_updated_at     BEFORE UPDATE ON settings     FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- Trigger : chaque nouveau message remonte sa conversation en tête de liste
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_conversation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_touch_conversation
  AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION touch_conversation();

-- =========================================================
--  Notifications automatiques et campagnes (identique à migrations/004_marketing.sql)
-- =========================================================

-- ---------------------------------------------------------
-- Nom de ville "normalisé" pour comparer trajets et centres d'intérêt :
-- « Saint-Pétersbourg », « saint petersbourg » et « SAINT PETERSBOURG » → 'saint petersbourg'
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION city_key(city TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF(btrim(regexp_replace(
    translate(lower(city), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ-''’', 'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy   '), -- majuscules accentuées : si la base est en locale « C »
    '\s+', ' ', 'g')), '')
$$;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS departure_key TEXT GENERATED ALWAYS AS (city_key(departure_city)) STORED;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS arrival_key   TEXT GENERATED ALWAYS AS (city_key(arrival_city)) STORED;
CREATE INDEX IF NOT EXISTS idx_trips_route_keys ON trips(arrival_key, departure_key);

-- ---------------------------------------------------------
-- Préférences de notifications marketing (désactivables dans le profil)
-- ---------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_route_alerts  BOOLEAN NOT NULL DEFAULT TRUE; -- alertes trajets, départs imminents, sélection de la semaine
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_campaigns     BOOLEAN NOT NULL DEFAULT TRUE; -- campagnes saisonnières
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone                VARCHAR(64);                  -- fuseau de l'appareil (heures calmes)
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;                  -- trajets favoris renseignés

-- Nouveaux types de notifications
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ROUTE_ALERT';     -- un voyageur part sur un trajet recherché / consulté / favori
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'DEPARTURE_SOON';  -- « Il reste 3 jours pour confier votre colis »
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'WEEKLY_DIGEST';   -- « Des voyageurs partent vers X cette semaine »
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'CAMPAIGN';        -- campagne saisonnière (fêtes, Tabaski, rentrée…)

-- ---------------------------------------------------------
-- Centres d'intérêt de trajets (clients connectés)
-- FAVORITE : déclaré à l'accueil · SEARCH : recherché · VIEW : consulté · RESERVATION : déjà réservé
-- Une ville vide ('') = « n'importe quelle ville »
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE interest_source AS ENUM ('FAVORITE', 'SEARCH', 'VIEW', 'RESERVATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS route_interests (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  departure_city  VARCHAR(80),
  arrival_city    VARCHAR(80),
  departure_key   TEXT GENERATED ALWAYS AS (COALESCE(city_key(departure_city), '')) STORED,
  arrival_key     TEXT GENERATED ALWAYS AS (COALESCE(city_key(arrival_city), '')) STORED,
  source          interest_source NOT NULL,
  hits            INT NOT NULL DEFAULT 1,               -- nombre de recherches / consultations
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_route_interest UNIQUE (user_id, departure_key, arrival_key, source),
  CONSTRAINT chk_interest_city CHECK (COALESCE(city_key(departure_city), '') <> '' OR COALESCE(city_key(arrival_city), '') <> '')
);
CREATE INDEX IF NOT EXISTS idx_route_interests_route ON route_interests(arrival_key, departure_key);

-- ---------------------------------------------------------
-- Campagnes manuelles (moments forts), créées par l'admin
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE campaign_audience AS ENUM ('CLIENTS', 'VOYAGEURS', 'ALL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS campaigns (
  id                SERIAL PRIMARY KEY,
  title             VARCHAR(80)  NOT NULL,
  body              VARCHAR(200) NOT NULL,
  link              VARCHAR(255) NOT NULL DEFAULT '/',
  audience          campaign_audience NOT NULL DEFAULT 'CLIENTS',
  destination_city  VARCHAR(80),                       -- facultatif : seulement les personnes intéressées par cette destination
  destination_key   TEXT GENERATED ALWAYS AS (COALESCE(city_key(destination_city), '')) STORED,
  moment            VARCHAR(80),                       -- ex. « Tabaski 2027 »
  status            campaign_status NOT NULL DEFAULT 'DRAFT',
  scheduled_at      TIMESTAMPTZ,
  recipients_count  INT NOT NULL DEFAULT 0,
  created_by        INT REFERENCES users(id) ON DELETE SET NULL,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- File d'envoi : tout message marketing y passe (anti-doublon, plafonds, heures calmes, statistiques)
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE marketing_status AS ENUM ('PENDING', 'SENT', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS marketing_queue (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             notification_type NOT NULL,
  title            VARCHAR(160) NOT NULL,
  body             VARCHAR(300) NOT NULL DEFAULT '',
  link             VARCHAR(255),
  dedupe_key       VARCHAR(120) NOT NULL,             -- ex. 'trip:42', 'digest:2026-W42', 'campaign:7'
  trip_id          INT REFERENCES trips(id) ON DELETE CASCADE,
  campaign_id      INT REFERENCES campaigns(id) ON DELETE SET NULL,
  send_after       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,                       -- après : inutile (voyage parti, campagne passée)
  status           marketing_status NOT NULL DEFAULT 'PENDING',
  skip_reason      VARCHAR(40),
  notification_id  BIGINT REFERENCES notifications(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at          TIMESTAMPTZ,
  CONSTRAINT uq_marketing_dedupe UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_marketing_pending ON marketing_queue(send_after) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_marketing_user_sent ON marketing_queue(user_id, sent_at) WHERE status = 'SENT';

-- Tâches quotidiennes déjà faites aujourd'hui (une seule exécution par jour, même avec plusieurs serveurs)
CREATE TABLE IF NOT EXISTS job_runs (
  name         VARCHAR(60) PRIMARY KEY,
  last_run_on  DATE NOT NULL
);
