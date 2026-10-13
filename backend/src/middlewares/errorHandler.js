import { AppError } from "../utils/AppError.js";
import { isDev } from "../config/env.js";

// Contraintes nommées du schéma → [statut HTTP, message, champ du formulaire concerné]
const CONSTRAINT_ERRORS = {
  uq_users_email: [409, "Cet email est déjà utilisé.", "email"],
  uq_users_phone: [409, "Ce numéro est déjà utilisé par un autre compte.", "phone"],
  uq_reservations_tracking_code: [409, "Code de suivi déjà existant, réessayez."],
  chk_reserved_lte_total: [409, "Plus assez de kilos disponibles sur ce voyage."],
  chk_reserved_positive: [409, "Incohérence sur les kilos réservés du voyage."],
  chk_arrival_after_departure: [400, "L'arrivée doit être postérieure au départ."],
  chk_stop_consistency: [400, "Escale incomplète : ville ET durée, ou aucune des deux."],
};

// Codes d'erreur PostgreSQL génériques
const PG_ERRORS = {
  "23505": [409, "Cette donnée existe déjà."],
  "23503": [409, "Opération impossible : cet élément est lié à d'autres données."],
  "23514": [400, "Données incohérentes."],
  "22P02": [400, "Format de donnée invalide."],
  "22003": [400, "Valeur numérique hors limites."],
  "22007": [400, "Date invalide."],
  "22008": [400, "Date invalide."],
};

export function notFound(req, res) {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.originalUrl}` });
}

// Express reconnaît un gestionnaire d'erreurs à ses 4 paramètres
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Corps JSON invalide." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Requête trop volumineuse." });

  const pgError = CONSTRAINT_ERRORS[err.constraint] ?? PG_ERRORS[err.code];
  if (pgError) {
    const [status, message, field] = pgError;
    return res.status(status).json({
      error: message,
      ...(field && { details: [{ field, message }] }), // le frontend l'affiche sous le bon champ
      ...(isDev && { debug: err.detail ?? err.message }),
    });
  }

  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur.", ...(isDev && { debug: err.message }) });
}
