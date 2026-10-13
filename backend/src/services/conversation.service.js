import * as conversationModel from "../models/conversation.model.js";
import * as messageModel from "../models/message.model.js";
import * as reservationService from "./reservation.service.js";
import * as notificationService from "./notification.service.js";
import * as realtime from "../socket/realtime.js";
import { paths } from "../utils/hashid.js";
import { ownerDisplayName } from "../utils/names.js";
import { hashToken, safeEqualHex } from "../utils/token.js";
import { badRequest, forbidden, notFound, unauthorized } from "../utils/AppError.js";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Qui parle ? Renvoie le "côté" de l'acteur dans la conversation :
 *  - OWNER    : propriétaire du voyage (voyageur, ou admin sur ses propres voyages)
 *  - CUSTOMER : client connecté qui a réservé, ou visiteur muni du bon jeton
 *  - ADMIN    : admin qui supervise le voyage d'un voyageur
 * actor = { user, guestToken } (l'un ou l'autre, ou les deux)
 */
export async function resolveAccess(conversationId, { user = null, guestToken = null } = {}) {
  const info = await conversationModel.findAccessInfo(conversationId);
  if (!info) throw notFound("Conversation introuvable.");

  if (user) {
    if (user.id === info.ownerId) return { side: "OWNER", info };
    if (user.id === info.clientId) return { side: "CUSTOMER", info };
    if (user.role === "ADMIN") return { side: "ADMIN", info };
  }
  if (guestToken && safeEqualHex(hashToken(guestToken), info.guestTokenHash)) {
    return { side: "CUSTOMER", info };
  }
  if (!user && !guestToken) throw unauthorized();
  throw forbidden("Vous n'avez pas accès à cette conversation.");
}

/* ---------- Boîte de réception (comptes uniquement) ---------- */

export async function listForUser(user, { scope, limit, offset }) {
  const result = await conversationModel.listForUser({
    userId: user.id,
    seeAll: user.role === "ADMIN" && scope !== "mine", // l'admin voit tout, sauf s'il filtre "mes voyages"
    limit,
    offset,
  });
  return { ...result, limit, offset };
}

export async function countUnread(user) {
  return { count: await conversationModel.countUnreadForUser(user.id) };
}

/* ---------- Une conversation ---------- */

export async function getDetail(conversationId, actor) {
  const { side } = await resolveAccess(conversationId, actor);
  const detail = await conversationModel.findDetail(conversationId);
  return { ...detail, viewerSide: side };
}

export async function listMessages(conversationId, actor, { before, limit }) {
  await resolveAccess(conversationId, actor);
  return messageModel.listPage(conversationId, { before, limit });
}

/**
 * Envoi d'un message (appelé par la route REST et par Socket.io).
 * `clientId` : identifiant temporaire choisi par le navigateur, renvoyé tel quel
 * pour qu'il remplace son message "en cours d'envoi" par le vrai.
 */
export async function sendMessage(conversationId, actor, body, { clientId = null } = {}) {
  const text = String(body ?? "").trim();
  if (!text) throw badRequest("Le message est vide.");
  if (text.length > MAX_MESSAGE_LENGTH) throw badRequest(`Message trop long (${MAX_MESSAGE_LENGTH} caractères max).`);

  const { side, info } = await resolveAccess(conversationId, actor);
  const message = await messageModel.create({
    conversationId,
    senderType: side,
    senderId: actor.user?.id ?? null,
    body: text,
  });
  // Écrire dans une conversation, c'est l'avoir lue
  if (side !== "ADMIN") await conversationModel.markRead(conversationId, side);
  await notificationService.markConversationRead(actor.user?.id, conversationId);

  // Notification AVANT la diffusion du message : quand le destinataire le lira,
  // sa notification existera déjà et sera marquée comme lue en même temps
  await notifyNewMessage(conversationId, info, side, actor, message);

  realtime.emitToConversation(conversationId, "message:new", { ...message, clientId });
  realtime.notifyInbox({ conversationId, ownerId: info.ownerId, clientId: info.clientId });
  return message;
}

/**
 * Prévient le ou les destinataires d'un nouveau message (comptes uniquement) :
 *  - client ou visiteur → propriétaire du voyage
 *  - propriétaire       → client (s'il a un compte)
 *  - admin              → propriétaire et client
 */
async function notifyNewMessage(conversationId, info, side, actor, message) {
  const recipients = { CUSTOMER: [info.ownerId], OWNER: [info.clientId], ADMIN: [info.ownerId, info.clientId] }[side]
    .filter((id) => id && id !== actor.user?.id);
  if (!recipients.length) return;

  try {
    const { reservation, owner } = await conversationModel.findDetail(conversationId);
    const senderName = {
      CUSTOMER: `${reservation.clientName}${reservation.isGuest ? " (visiteur)" : ""}`,
      OWNER: ownerDisplayName(owner),
      ADMIN: "Équipe MoveColis",
    }[side];

    await notificationService.notify(recipients, {
      type: "NEW_MESSAGE",
      title: senderName,
      body: message.body,
      link: paths.conversation(conversationId),
      groupKey: notificationService.conversationGroup(conversationId),
    });
  } catch (err) {
    console.error("[notifications] nouveau message", err); // le message est envoyé quoi qu'il arrive
  }
}

// Accusé de lecture : l'autre côté voit "Vu" sous ses messages
export async function markRead(conversationId, actor) {
  const { side, info } = await resolveAccess(conversationId, actor);
  if (side === "ADMIN") return { side, readAt: null }; // l'admin observateur ne marque rien comme lu

  const readAt = await conversationModel.markRead(conversationId, side);
  await notificationService.markConversationRead(actor.user?.id, conversationId);
  realtime.emitToConversation(conversationId, "conversation:read", { conversationId, side, readAt });
  realtime.emitToUser(side === "OWNER" ? info.ownerId : info.clientId, "inbox:updated", { conversationId });
  return { side, readAt };
}

/**
 * Faire avancer (ou annuler) la réservation depuis la conversation.
 *  - propriétaire et admin : toutes les étapes du workflow
 *  - client / visiteur     : uniquement annuler, tant que ce n'est pas confirmé
 */
export async function changeReservationStatus(conversationId, actor, nextStatus, note) {
  const { side, info } = await resolveAccess(conversationId, actor);

  if (side === "CUSTOMER") {
    if (nextStatus !== "CANCELLED") {
      throw forbidden("Seul le propriétaire du voyage peut faire avancer la réservation.");
    }
    return reservationService.updateReservationStatus(info.reservationId, "CANCELLED", {
      actorId: actor.user?.id ?? null,
      note,
      onlyFromStatuses: ["PENDING"],
      cancelledBy: "par le client",
    });
  }

  return reservationService.updateReservationStatus(info.reservationId, nextStatus, {
    actorId: actor.user.id,
    note,
    cancelledBy: side === "ADMIN" ? "par l'équipe MoveColis" : "par le propriétaire du voyage",
  });
}
