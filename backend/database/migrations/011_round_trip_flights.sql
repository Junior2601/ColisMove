-- =========================================================
--  Migration 011 : billets aller-retour (en plus de l'aller simple)
--  - recherches : mois de retour (NULL = aller simple), une entrée de cache par trajet, mois de départ et mois de retour
--  - billets    : vol retour donné par Aviasales (NULL = aller simple) ; un même aller avec deux retours = deux billets
--  - demandes   : vol retour figé, et ses propres valises : le client en retire à l'aller, au retour ou sur les deux,
--                 chaque vol libère ses kilos (publiables séparément dans « Kilos disponibles »)
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- Recherches
ALTER TABLE flight_searches ADD COLUMN IF NOT EXISTS return_month DATE; -- premier jour du mois de retour
ALTER TABLE flight_searches DROP CONSTRAINT IF EXISTS flight_searches_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS uq_flight_searches_route
  ON flight_searches (origin, destination, month, (COALESCE(return_month, DATE '1900-01-01')));

-- Billets : le vol retour (heures locales, comme l'aller)
ALTER TABLE flight_offers
  ADD COLUMN IF NOT EXISTS return_at                 TIMESTAMP,   -- départ du retour (NULL = aller simple)
  ADD COLUMN IF NOT EXISTS return_utc                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_arrival_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS return_origin_airport     VARCHAR(3),
  ADD COLUMN IF NOT EXISTS return_destination_airport VARCHAR(3),
  ADD COLUMN IF NOT EXISTS return_transfers          SMALLINT,
  ADD COLUMN IF NOT EXISTS return_stop_airports      VARCHAR(60),
  ADD COLUMN IF NOT EXISTS return_duration_minutes   INT;
ALTER TABLE flight_offers DROP CONSTRAINT IF EXISTS uq_flight_offer;
CREATE UNIQUE INDEX IF NOT EXISTS uq_flight_offer
  ON flight_offers (origin, destination, departure_at, airline, flight_number, (COALESCE(return_at, TIMESTAMP '1900-01-01')));

-- Demandes : le vol retour figé, ses valises et ses kilos libérés
ALTER TABLE flight_orders
  ADD COLUMN IF NOT EXISTS return_at                 TIMESTAMP,   -- NULL = aller simple
  ADD COLUMN IF NOT EXISTS return_arrival_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS return_origin_airport     VARCHAR(3),
  ADD COLUMN IF NOT EXISTS return_destination_airport VARCHAR(3),
  ADD COLUMN IF NOT EXISTS return_transfers          SMALLINT,
  ADD COLUMN IF NOT EXISTS return_stops              JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS return_duration_minutes   INT,
  ADD COLUMN IF NOT EXISTS return_bags_included      SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_bags_kept          SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_bag_discount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_freed_kilos        NUMERIC(6,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_kilos_trip_id      INT REFERENCES trips(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE flight_orders ADD CONSTRAINT chk_flight_orders_return_bags CHECK (return_bags_kept BETWEEN 0 AND return_bags_included);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_flight_orders_return_freed_kilos ON flight_orders(return_at) WHERE return_freed_kilos > 0;
