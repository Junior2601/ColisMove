-- =========================================================
--  Migration 013 : demandes « vol choisi en direct »
--  Le client trouve son vol dans la recherche en direct (page « Vols en direct », widget Aviasales) et demande
--  à MoveColis de l'acheter pour lui (paiement Mobile Money). Le vol exact n'est pas connu à la demande :
--  l'équipe le retrouve, puis saisit la compagnie, le numéro, les heures et le prix (quoted_at).
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- Compagnie et numéro du vol : inconnus tant que l'équipe n'a pas confirmé le vol d'une demande en direct
ALTER TABLE flight_orders ALTER COLUMN airline DROP NOT NULL;
ALTER TABLE flight_orders ALTER COLUMN flight_number DROP NOT NULL;

-- Vol décrit par le client : { airline, departureTime, returnDepartureTime, seenPrice, search, ticketId }
-- (NULL : billet choisi dans les résultats de MoveColis)
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS live_request JSONB;
-- Vol et prix confirmés par l'équipe (demande en direct) : avant, ni paiement ni billet
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ;
