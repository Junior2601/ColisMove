-- =========================================================
--  Migration 008 : heure d'arrivée et villes d'escale des billets d'avion
--  (lues dans le lien Aviasales de chaque billet) ; utilisées pour publier les kilos libérés
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- Billets : heure LOCALE d'arrivée, aéroports d'escale ("DOH" ou "IST SAW NCE"). NULL = non précisé
ALTER TABLE flight_offers ADD COLUMN IF NOT EXISTS arrival_at    TIMESTAMP;
ALTER TABLE flight_offers ADD COLUMN IF NOT EXISTS stop_airports VARCHAR(60);
-- Les billets seront redemandés à Aviasales à la prochaine recherche, avec ces informations
UPDATE flight_searches SET fetched_at = NULL;

-- Demandes : figées au moment de la demande. stops = [{ code, name, airports }] (ville d'escale, ses aéroports)
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS arrival_at TIMESTAMP;
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS stops      JSONB NOT NULL DEFAULT '[]';

-- Demandes déjà faites : retrouvées dans leur lien Aviasales (t=QR<départ><arrivée><durée><aéroports>_…).
-- Le nom des villes d'escale n'est pas connu ici : le site affiche alors le code de l'aéroport.
UPDATE flight_orders
SET arrival_at = to_timestamp(substring(link FROM 't=[A-Z0-9]{2}[0-9]{10}([0-9]{10})')::bigint) AT TIME ZONE 'UTC'
WHERE arrival_at IS NULL
  AND link ~ 't=[A-Z0-9]{2}[0-9]{26}[A-Z]{6,}_'
  -- même garde que le site : le départ codé dans le lien doit être celui de la demande
  AND to_timestamp(substring(link FROM 't=[A-Z0-9]{2}([0-9]{10})')::bigint) AT TIME ZONE 'UTC' = departure_at;

UPDATE flight_orders o
SET stops = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'name', NULL, 'airports', jsonb_build_array(code)) ORDER BY i), '[]')
  FROM (
    SELECT i, substr(r.airports, i * 3 + 1, 3) AS code
    FROM generate_series(1, length(r.airports) / 3 - 2) AS i
  ) s
)
FROM (SELECT id, substring(link FROM 't=[A-Z0-9]{2}[0-9]{26}((?:[A-Z]{3}){2,})_') AS airports FROM flight_orders) r
WHERE r.id = o.id AND r.airports IS NOT NULL AND o.stops = '[]'::jsonb AND o.arrival_at IS NOT NULL;
