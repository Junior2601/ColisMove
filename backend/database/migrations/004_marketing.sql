-- =========================================================
--  Migration 004 : notifications automatiques (réengagement) et campagnes
--  PostgreSQL 12 ou plus récent (colonnes générées). Rejouable sans erreur :
--    npm run db:sql -- database/migrations/004_marketing.sql
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
