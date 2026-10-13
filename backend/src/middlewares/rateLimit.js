import { rateLimit } from "express-rate-limit";

/*
 * Limite le nombre de requêtes par adresse IP sur les routes sensibles.
 * Derrière Caddy, la vraie IP du visiteur est lue grâce à app.set("trust proxy", 1).
 */
const limiter = (windowMinutes, limit, error) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error },
  });

// Connexion : 10 tentatives / 15 min (empêche de deviner les mots de passe)
export const loginLimiter = limiter(15, 10, "Trop de tentatives de connexion. Réessayez dans 15 minutes.");

// Inscription : 5 comptes / heure par IP
export const registerLimiter = limiter(60, 5, "Trop d'inscriptions depuis cette connexion. Réessayez plus tard.");

// Réservations : 10 / heure par IP (évite qu'un visiteur bloque tous les kilos d'un voyage)
export const reservationLimiter = limiter(60, 10, "Trop de réservations depuis cette connexion. Réessayez plus tard.");

// Mot de passe oublié : 5 demandes / heure par IP (évite d'inonder une boîte mail)
export const forgotPasswordLimiter = limiter(60, 5, "Trop de demandes. Réessayez dans une heure.");

// Réinitialisation : 20 essais / heure par IP
export const resetPasswordLimiter = limiter(60, 20, "Trop de tentatives. Réessayez plus tard.");
