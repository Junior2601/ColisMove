-- =========================================================
--  Migration 012 : recherche de billets à une date exacte
--  Le client choisit le jour de départ (et le jour de retour d'un aller-retour) dans un calendrier.
--  Le cache des réponses d'Aviasales est donc aussi tenu par jour ; les recherches de l'admin restent par mois
--  (day et return_day NULL), et servent aussi aux « dates proches » proposées au client.
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

ALTER TABLE flight_searches ADD COLUMN IF NOT EXISTS day        DATE; -- jour de départ (NULL : mois entier)
ALTER TABLE flight_searches ADD COLUMN IF NOT EXISTS return_day DATE; -- jour de retour (NULL : aller simple ou mois entier)

DROP INDEX IF EXISTS uq_flight_searches_route;
CREATE UNIQUE INDEX uq_flight_searches_route ON flight_searches (
  origin, destination, month,
  (COALESCE(return_month, DATE '1900-01-01')),
  (COALESCE(day, DATE '1900-01-01')),
  (COALESCE(return_day, DATE '1900-01-01'))
);
