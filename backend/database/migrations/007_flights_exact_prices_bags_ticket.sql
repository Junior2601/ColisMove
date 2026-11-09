-- =========================================================
--  Migration 007 : billets d'avion au prix exact d'Aviasales, valises retirées par le client
--  (kilos libérés pour MoveColis), billet envoyé par e-mail, notification des nouveaux voyages
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- ---------------------------------------------------------
-- Prix : plus de marge, de frais de service, d'arrondi ni de prix fixé à la main.
-- Prix adulte = prix Aviasales converti dans la devise affichée, c'est tout.
-- ---------------------------------------------------------
ALTER TABLE flight_settings DROP COLUMN IF EXISTS markup_percent;
ALTER TABLE flight_settings DROP COLUMN IF EXISTS service_fee;
ALTER TABLE flight_settings DROP COLUMN IF EXISTS round_to;
ALTER TABLE flight_offers   DROP COLUMN IF EXISTS price_override;

-- Bagages et conditions du tarif donnés par Aviasales (lus dans le lien du billet). NULL = non précisé
ALTER TABLE flight_offers ADD COLUMN IF NOT EXISTS fare_checked_bags SMALLINT; -- valises en soute par passager
ALTER TABLE flight_offers ADD COLUMN IF NOT EXISTS fare_bag_kg       SMALLINT; -- poids d'une valise
ALTER TABLE flight_offers ADD COLUMN IF NOT EXISTS fare_cabin_bag    BOOLEAN;  -- bagage cabine inclus
ALTER TABLE flight_offers ADD COLUMN IF NOT EXISTS fare_changeable   BOOLEAN;  -- billet modifiable
ALTER TABLE flight_offers ADD COLUMN IF NOT EXISTS fare_refundable   BOOLEAN;  -- billet remboursable
-- Les prix seront redemandés à Aviasales à la prochaine recherche, avec leurs bagages
UPDATE flight_searches SET fetched_at = NULL;

-- Demandes : bagage cabine NULL = inclus, poids non précisé par Aviasales (0 = aucun)
ALTER TABLE flight_orders ALTER COLUMN cabin_kg DROP NOT NULL;

-- Valise en soute retirée par le client : réduction sur le billet (devise affichée). 0 = le client ne peut pas en retirer
ALTER TABLE flight_settings ADD COLUMN IF NOT EXISTS bag_refund NUMERIC(12,2) NOT NULL DEFAULT 110000;
DO $$ BEGIN
  ALTER TABLE flight_settings ADD CONSTRAINT chk_flight_settings_bag_refund CHECK (bag_refund >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------
-- Demandes de billets
-- ---------------------------------------------------------
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS client_email   VARCHAR(160);                -- reçoit le billet
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS bags_included  SMALLINT NOT NULL DEFAULT 0; -- valises en soute incluses (tous passagers, hors bébés)
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS bags_kept      SMALLINT NOT NULL DEFAULT 0; -- valises gardées par le client
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS bag_refund     NUMERIC(12,2) NOT NULL DEFAULT 0; -- réduction par valise retirée, figée
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS bag_discount   NUMERIC(14,2) NOT NULL DEFAULT 0; -- réduction totale appliquée
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS freed_kilos    NUMERIC(6,2)  NOT NULL DEFAULT 0; -- kilos libérés pour MoveColis
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS kilos_trip_id  INT REFERENCES trips(id) ON DELETE SET NULL; -- voyage publié avec ces kilos
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS receipt_email  VARCHAR(160);                -- dernier envoi du billet par e-mail
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

-- Demandes déjà faites : toutes les valises incluses gardées
UPDATE flight_orders
SET bags_included = checked_bags * (adults + children), bags_kept = checked_bags * (adults + children)
WHERE bags_included = 0 AND checked_bags > 0;

DO $$ BEGIN
  ALTER TABLE flight_orders ADD CONSTRAINT chk_flight_orders_bags CHECK (bags_kept BETWEEN 0 AND bags_included);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Espace « Kilos disponibles » de l'admin
CREATE INDEX IF NOT EXISTS idx_flight_orders_freed_kilos ON flight_orders(departure_at) WHERE freed_kilos > 0;

-- ---------------------------------------------------------
-- Notification envoyée à tous les clients à chaque nouveau voyage publié
-- ---------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'NEW_TRIP';
