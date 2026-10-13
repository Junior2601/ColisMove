import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import * as userModel from "../models/user.model.js";
import { forbidden, unauthorized } from "../utils/AppError.js";

/**
 * Vérifie le JWT "Authorization: Bearer <token>" puis recharge l'utilisateur depuis la BD.
 * Avantage : un voyageur révoqué ou un rôle modifié est pris en compte immédiatement,
 * sans attendre l'expiration du token. Seuls les comptes APPROVED passent.
 */
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized("Session invalide ou expirée, reconnectez-vous.");
  }

  const user = await userModel.findById(Number(payload.sub));
  if (!user) throw unauthorized("Compte introuvable.");
  // Voyageur révoqué ou remis en attente : 401 → le frontend le déconnecte aussitôt
  if (user.status !== "APPROVED") throw unauthorized("Votre compte n'est plus actif.");

  req.user = user;
  next();
}

// À placer après authenticate : authorize("ADMIN"), authorize("ADMIN", "VOYAGEUR")…
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden("Vous n'avez pas accès à cette ressource.");
    next();
  };
}

/**
 * JWT → utilisateur approuvé, ou null (token absent, invalide, expiré, compte inactif).
 * Utilisé par optionalAuth et par Socket.io.
 */
export async function userFromToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
  const user = await userModel.findById(Number(payload.sub));
  return user?.status === "APPROVED" ? user : null;
}

// Connexion facultative : req.user si le token est valide, sinon visiteur anonyme (req.user = null)
export async function optionalAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  req.user = scheme === "Bearer" ? await userFromToken(token) : null;
  next();
}

// À placer après optionalAuth sur les routes réservées aux comptes
export function requireUser(req, res, next) {
  if (!req.user) throw unauthorized();
  next();
}

/**
 * Messagerie : l'acteur est soit un utilisateur connecté, soit un visiteur muni du jeton
 * reçu à la réservation (en-tête X-Guest-Token). L'accès précis est vérifié par le service.
 */
export function requireActor(req, res, next) {
  req.actor = { user: req.user ?? null, guestToken: req.get("x-guest-token") || null };
  if (!req.actor.user && !req.actor.guestToken) throw unauthorized();
  next();
}
