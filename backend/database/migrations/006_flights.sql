-- =========================================================
--  Migration 006 : billets d'avion (prix Aviasales via l'API Travelpayouts)
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- ---------------------------------------------------------
-- Règles de prix fixées par l'admin (une seule ligne, id = 1)
-- Prix adulte = prix Aviasales × taux de change × (1 + marge %) + frais de service, arrondi au supérieur
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_settings (
  id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled                    BOOLEAN       NOT NULL DEFAULT FALSE,     -- onglet « Billets d'avion » visible sur l'accueil
  source_currency            VARCHAR(3)    NOT NULL DEFAULT 'EUR' CHECK (source_currency IN ('RUB', 'EUR', 'USD')), -- devise demandée à Aviasales
  currency                   VARCHAR(3)    NOT NULL DEFAULT 'XOF' CHECK (currency ~ '^[A-Z]{3}$'),                 -- devise affichée aux clients
  exchange_rate              NUMERIC(14,6) NOT NULL DEFAULT 655.957 CHECK (exchange_rate > 0),  -- 1 source_currency = x currency
  markup_percent             NUMERIC(6,2)  NOT NULL DEFAULT 10 CHECK (markup_percent BETWEEN 0 AND 300),
  service_fee                NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),         -- par billet adulte
  round_to                   NUMERIC(12,2) NOT NULL DEFAULT 500 CHECK (round_to >= 0),          -- 0 = pas d'arrondi
  child_percent              NUMERIC(5,2)  NOT NULL DEFAULT 75 CHECK (child_percent BETWEEN 0 AND 100),  -- 2 à 11 ans
  infant_percent             NUMERIC(5,2)  NOT NULL DEFAULT 10 CHECK (infant_percent BETWEEN 0 AND 100), -- moins de 2 ans, sur les genoux
  default_checked_bags       SMALLINT      NOT NULL DEFAULT 0 CHECK (default_checked_bags BETWEEN 0 AND 5),
  default_cabin_kg           SMALLINT      NOT NULL DEFAULT 7 CHECK (default_cabin_kg BETWEEN 0 AND 30),
  checked_bag_kg             SMALLINT      NOT NULL DEFAULT 23 CHECK (checked_bag_kg BETWEEN 1 AND 50),
  cache_hours                SMALLINT      NOT NULL DEFAULT 6 CHECK (cache_hours BETWEEN 1 AND 72),   -- fraîcheur des prix
  min_hours_before_departure SMALLINT      NOT NULL DEFAULT 48 CHECK (min_hours_before_departure BETWEEN 1 AND 720),
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
INSERT INTO flight_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_flight_settings_updated_at ON flight_settings;
CREATE TRIGGER trg_flight_settings_updated_at BEFORE UPDATE ON flight_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- Options que le client ajoute à son billet (bagage en plus, billet modifiable…), prix en devise affichée
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE flight_option_unit AS ENUM ('BOOKING', 'PASSENGER'); -- prix par réservation ou par passager
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS flight_options (
  id            SERIAL PRIMARY KEY,
  label         VARCHAR(80)  NOT NULL,
  description   VARCHAR(255),
  price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  unit          flight_option_unit NOT NULL DEFAULT 'BOOKING',
  max_quantity  SMALLINT NOT NULL DEFAULT 1 CHECK (max_quantity BETWEEN 1 AND 20), -- 1 = case à cocher
  active        BOOLEAN  NOT NULL DEFAULT TRUE,
  position      SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_flight_options_updated_at ON flight_options;
CREATE TRIGGER trg_flight_options_updated_at BEFORE UPDATE ON flight_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Exemples modifiables par l'admin (seulement à la création)
INSERT INTO flight_options (label, description, price, unit, max_quantity, position)
SELECT * FROM (VALUES
  ('Bagage en soute supplémentaire', 'Valise de 23 kg en plus des bagages inclus', 30000::numeric, 'BOOKING'::flight_option_unit, 4::smallint, 1::smallint),
  ('Billet modifiable', 'Changement de date possible (hors différence de tarif)', 25000::numeric, 'PASSENGER'::flight_option_unit, 1::smallint, 2::smallint)
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM flight_options);

-- ---------------------------------------------------------
-- Recherches déjà faites auprès d'Aviasales (trajet + mois) : cache et trajets demandés par les clients
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_searches (
  origin             CHAR(3) NOT NULL,          -- code IATA de la ville (MOW, ABJ…)
  destination        CHAR(3) NOT NULL,
  month              DATE    NOT NULL,          -- premier jour du mois de départ
  fetched_at         TIMESTAMPTZ,               -- dernière réponse d'Aviasales (NULL : jamais obtenue)
  offers_count       INT NOT NULL DEFAULT 0,
  requests           INT NOT NULL DEFAULT 0,    -- nombre de recherches des clients
  last_requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (origin, destination, month)
);
CREATE INDEX IF NOT EXISTS idx_flight_searches_recent ON flight_searches(last_requested_at DESC);

-- ---------------------------------------------------------
-- Billets trouvés sur Aviasales. Les colonnes « admin » ne sont jamais écrasées par une mise à jour des prix.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_offers (
  id                   SERIAL PRIMARY KEY,
  origin               CHAR(3)     NOT NULL,
  destination          CHAR(3)     NOT NULL,
  origin_airport       VARCHAR(3),
  destination_airport  VARCHAR(3),
  departure_at         TIMESTAMP   NOT NULL,     -- heure locale de départ, comme sur le billet
  departure_utc        TIMESTAMPTZ NOT NULL,     -- instant exact (départ passé ou trop proche)
  airline              VARCHAR(3)  NOT NULL,     -- code IATA de la compagnie (TK, SU, AF…)
  flight_number        VARCHAR(10) NOT NULL,
  transfers            SMALLINT    NOT NULL DEFAULT 0,
  duration_minutes     INT,
  source_price         NUMERIC(12,2) NOT NULL,   -- prix Aviasales
  source_currency      VARCHAR(3)  NOT NULL,
  link                 TEXT,                     -- chemin de la recherche sur aviasales.ru (achat par l'admin)
  gate                 VARCHAR(80),              -- agence qui vend ce prix sur Aviasales (Trip.com, Wingie…)
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Modifications de l'admin (NULL = règle générale)
  price_override       NUMERIC(12,2) CHECK (price_override >= 0),        -- prix adulte final, devise affichée
  checked_bags         SMALLINT CHECK (checked_bags BETWEEN 0 AND 5),    -- bagages en soute inclus
  cabin_kg             SMALLINT CHECK (cabin_kg BETWEEN 0 AND 30),       -- bagage cabine inclus
  info                 VARCHAR(160),                                     -- précision affichée au client
  hidden               BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at            TIMESTAMPTZ,
  edited_by            INT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_flight_offer UNIQUE (origin, destination, departure_at, airline, flight_number)
);
CREATE INDEX IF NOT EXISTS idx_flight_offers_route ON flight_offers(origin, destination, departure_at);

-- ---------------------------------------------------------
-- Demandes d'achat de billet : traitées par l'admin dans la messagerie
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE flight_order_status AS ENUM (
    'PENDING',    -- demande reçue, prix à confirmer
    'PAID',       -- paiement reçu
    'ISSUED',     -- billet acheté et envoyé au client
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS flight_orders (
  id                   SERIAL PRIMARY KEY,
  reference            VARCHAR(20)  NOT NULL,          -- BA-YYYYMMDD-XXXX
  offer_id             INT REFERENCES flight_offers(id) ON DELETE SET NULL,
  client_id            INT REFERENCES users(id) ON DELETE SET NULL,  -- NULL : visiteur sans compte
  agent_id             INT REFERENCES users(id) ON DELETE SET NULL,  -- admin qui traite la demande dans la messagerie

  client_name          VARCHAR(160) NOT NULL,
  client_phone         VARCHAR(20)  NOT NULL,
  note                 VARCHAR(500),

  -- Vol, figé au moment de la demande
  origin               CHAR(3)      NOT NULL,
  destination          CHAR(3)      NOT NULL,
  origin_city          VARCHAR(80)  NOT NULL,
  destination_city     VARCHAR(80)  NOT NULL,
  origin_airport       VARCHAR(3),
  destination_airport  VARCHAR(3),
  departure_at         TIMESTAMP    NOT NULL,
  airline              VARCHAR(3)   NOT NULL,
  airline_name         VARCHAR(80),
  flight_number        VARCHAR(10)  NOT NULL,
  transfers            SMALLINT     NOT NULL DEFAULT 0,
  duration_minutes     INT,
  checked_bags         SMALLINT     NOT NULL DEFAULT 0,
  cabin_kg             SMALLINT     NOT NULL DEFAULT 0,
  checked_bag_kg       SMALLINT     NOT NULL DEFAULT 23,
  link                 TEXT,
  gate                 VARCHAR(80),

  -- Passagers et prix, figés et calculés côté serveur
  adults               SMALLINT     NOT NULL CHECK (adults BETWEEN 1 AND 9),
  children             SMALLINT     NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 8),
  infants              SMALLINT     NOT NULL DEFAULT 0 CHECK (infants BETWEEN 0 AND 9),
  adult_price          NUMERIC(12,2) NOT NULL,
  child_price          NUMERIC(12,2) NOT NULL,
  infant_price         NUMERIC(12,2) NOT NULL,
  options              JSONB        NOT NULL DEFAULT '[]', -- [{ id, label, unit, quantity, unitPrice, amount }]
  total_amount         NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  currency             VARCHAR(3)   NOT NULL,

  status               flight_order_status NOT NULL DEFAULT 'PENDING',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_flight_orders_reference UNIQUE (reference),
  CONSTRAINT chk_flight_orders_phone    CHECK (client_phone ~ '^[0-9]{8,15}$'),
  CONSTRAINT chk_flight_orders_seats    CHECK (adults + children + infants <= 9),
  CONSTRAINT chk_flight_orders_infants  CHECK (infants <= adults)          -- un bébé par adulte
);
CREATE INDEX IF NOT EXISTS idx_flight_orders_status  ON flight_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flight_orders_client  ON flight_orders(client_id);
DROP TRIGGER IF EXISTS trg_flight_orders_updated_at ON flight_orders;
CREATE TRIGGER trg_flight_orders_updated_at BEFORE UPDATE ON flight_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- Messagerie : une conversation porte sur une réservation de kilos OU sur une demande de billet
-- ---------------------------------------------------------
ALTER TABLE conversations ALTER COLUMN reservation_id DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS flight_order_id INT REFERENCES flight_orders(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE conversations ADD CONSTRAINT uq_conversations_flight_order UNIQUE (flight_order_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE conversations ADD CONSTRAINT chk_conversation_subject CHECK (num_nonnulls(reservation_id, flight_order_id) = 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notifications des demandes de billets
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'FLIGHT_ORDER';        -- (admin) nouvelle demande de billet
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'FLIGHT_ORDER_STATUS'; -- (client) paiement reçu, billet émis, annulation
