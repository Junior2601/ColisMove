import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import * as userModel from "../models/user.model.js";
import { normalizePhone } from "../utils/phone.js";
import { TERMS_VERSION } from "../config/constants.js";
import * as realtime from "../socket/realtime.js";
import * as notificationService from "./notification.service.js";
import { badRequest, forbidden, notFound, unauthorized } from "../utils/AppError.js";

// Hash factice : si le compte n'existe pas, on compare quand même → même temps de réponse
// (impossible de deviner quels emails / numéros sont inscrits en chronométrant la requête)
const DUMMY_HASH = bcrypt.hashSync("kilofly-dummy-password", 10);

export function signToken(user) {
  return jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user.id),
    expiresIn: env.jwtExpiresIn,
  });
}

// Retire le hash avant de renvoyer l'utilisateur
const withoutPassword = ({ passwordHash, ...user }) => user;

/** Connexion avec l'email ou le numéro de téléphone (format international) */
export async function login({ identifier, password }) {
  const user = identifier.includes("@")
    ? await userModel.findByEmailWithPassword(identifier.toLowerCase())
    : await userModel.findByPhoneWithPassword(normalizePhone(identifier));

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw unauthorized("Identifiants incorrects.");

  // Vérifié APRÈS le mot de passe : on ne révèle le statut qu'au titulaire du compte
  if (user.status === "PENDING") {
    throw forbidden("Votre compte voyageur est en attente d'approbation par l'administrateur.");
  }
  if (user.status === "REJECTED") {
    throw forbidden("Votre compte voyageur n'est pas actif. Contactez le support MoveColis.");
  }

  const publicUser = withoutPassword(user);
  return { token: signToken(publicUser), user: publicUser };
}

/**
 * Inscription.
 * - CLIENT   : compte actif tout de suite → connecté directement (token renvoyé)
 * - VOYAGEUR : compte PENDING → pas de token, il attend l'approbation de l'admin
 */
export async function register(data) {
  const isTraveler = data.role === "VOYAGEUR";
  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await userModel.create({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    city: data.city ?? null,
    role: data.role,
    status: isTraveler ? "PENDING" : "APPROVED",
    passwordHash,
    termsVersion: TERMS_VERSION, // le validateur a déjà exigé acceptTerms === true
  });

  if (isTraveler) {
    realtime.emitToAdmins("travelers:pending", { travelerId: user.id }); // le tableau de bord admin se met à jour
    // Les demandes en attente sont regroupées : "Nouvelle demande" (×3) plutôt que 3 notifications
    await notificationService.notifySafely(await userModel.listAdminIds(), {
      type: "TRAVELER_PENDING",
      title: "Nouvelle demande de compte voyageur",
      body: `${user.firstName} ${user.lastName}${user.city ? ` · ${user.city}` : ""}`,
      link: "/admin/approbations",
      groupKey: "travelers:pending",
    });
    return { user, pendingApproval: true };
  }
  return { user, token: signToken(user), pendingApproval: false };
}

export async function getMe(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw notFound("Compte introuvable.");
  return user;
}

/* ===================== Profil ===================== */

// Modifier ses informations (email et téléphone restent uniques : erreur 409 sur le bon champ sinon)
export async function updateMe(userId, data) {
  return userModel.updateProfile(userId, data);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const hash = await userModel.findPasswordHash(userId);
  if (!hash || !(await bcrypt.compare(currentPassword, hash))) {
    throw badRequest("Mot de passe actuel incorrect.", [
      { field: "currentPassword", message: "Mot de passe actuel incorrect." },
    ]);
  }
  await userModel.updatePassword(userId, await bcrypt.hash(newPassword, 12));
  return { ok: true };
}
