-- =========================================================
--  Migration 009 : passagers des demandes de billet d'avion
--  (nom comme sur le passeport, genre, date de naissance, nationalité, numéro de passeport)
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- [{ type: ADULT|CHILD|INFANT, fullName, gender: M|F, birthDate: "AAAA-MM-JJ", nationality: "CI",
--    nationalityName: "Côte d'Ivoire", passportNumber }]. [] : demandes faites avant cette migration
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS passengers JSONB NOT NULL DEFAULT '[]';
