import { withTransaction } from "../config/db.js";
import * as conversationModel from "../models/conversation.model.js";
import * as messageModel from "../models/message.model.js";
import * as flightOrderModel from "../models/flightOrder.model.js";
import * as reservationModel from "../models/reservation.model.js";
import * as settingsModel from "../models/settings.model.js";
import * as userModel from "../models/user.model.js";
import * as reservationService from "./reservation.service.js";
import * as flightOrderService from "./flightOrder.service.js";
import * as notificationService from "./notification.service.js";
import * as realtime from "../socket/realtime.js";
import { RESERVATION_STATUSES } from "../config/constants.js";
import { paths } from "../utils/hashid.js";
import { ownerDisplayName } from "../utils/names.js";
import { hashToken, safeEqualHex } from "../utils/token.js";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../utils/AppError.js";

const MAX_MESSAGE_LENGTH = 2000;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // photo déjà réduite par le navigateur (même limite que nginx)
const MAX_IMAGES_PER_CONVERSATION = 30;

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
  if (detail.kind === "FLIGHT") {
    // Le lien d'achat Aviasales n'est montré qu'à l'équipe MoveColis
    const order =
      side === "CUSTOMER"
        ? flightOrderService.forCustomer(detail.flightOrder)
        : flightOrderService.withPurchaseUrl(detail.flightOrder);
    return { ...detail, flightOrder: order, viewerSide: side };
  }
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
 * `image` : photo jointe { contentType, data, width, height } (voir sendImage)
 */
export async function sendMessage(conversationId, actor, body, { clientId = null, image = null } = {}) {
  const text = String(body ?? "").trim();
  if (!text) throw badRequest("Le message est vide.");
  if (text.length > MAX_MESSAGE_LENGTH) throw badRequest(`Message trop long (${MAX_MESSAGE_LENGTH} caractères max).`);

  const { side, info } = await resolveAccess(conversationId, actor);
  const fields = { conversationId, senderType: side, senderId: actor.user?.id ?? null, body: text };
  const message = image
    ? await withTransaction(async (db) => {
        const created = await messageModel.create(fields, db);
        return { ...created, attachment: await messageModel.addAttachment(created.id, image, db) };
      })
    : await messageModel.create(fields);
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

/* ---------- Photos (demandes de billet : capture du paiement…) ---------- */

// Type réel de l'image d'après ses premiers octets (on ne se fie pas au type annoncé par le navigateur)
function imageTypeOf(data) {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length > 12 && data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Photo envoyée dans une conversation (ex. capture du paiement par le client).
 * data : octets de l'image (JPEG, PNG ou WebP), déjà réduite par le navigateur
 * caption : texte du message (« 📷 Capture du paiement »…), « 📷 Photo » par défaut
 */
export async function sendImage(conversationId, actor, { data, caption, width, height, clientId }) {
  await resolveAccess(conversationId, actor);
  if (!Buffer.isBuffer(data) || !data.length) throw badRequest("Photo manquante.");
  if (data.length > MAX_IMAGE_BYTES) throw badRequest("Photo trop lourde : 2 Mo au maximum.");
  const contentType = imageTypeOf(data);
  if (!contentType) throw badRequest("Format non pris en charge : envoyez une photo JPG, PNG ou WebP.");
  if ((await messageModel.countAttachments(conversationId)) >= MAX_IMAGES_PER_CONVERSATION) {
    throw conflict(`${MAX_IMAGES_PER_CONVERSATION} photos au maximum par conversation.`);
  }
  return sendMessage(conversationId, actor, caption || "📷 Photo", {
    clientId,
    image: { contentType, data, width: width ?? null, height: height ?? null },
  });
}

/** Fichier d'une photo, pour les participants de la conversation uniquement */
export async function getAttachment(conversationId, attachmentId, actor) {
  await resolveAccess(conversationId, actor);
  const attachment = await messageModel.findAttachment(conversationId, attachmentId);
  if (!attachment) throw notFound("Photo introuvable.");
  return attachment;
}

/* ---------- Paiement : numéros envoyés au client, puis paiement reçu ---------- */

/**
 * Numéros de paiement à envoyer au client :
 *  - billet d'avion ou voyage publié par MoveColis → ceux de MoveColis (Paramètres de messagerie)
 *  - voyage d'un voyageur → les siens (page Profil) : ses clients le paient directement
 */
async function paymentNumbersFor(detail, side) {
  if (detail.kind === "FLIGHT" || detail.owner.role === "ADMIN") {
    const { paymentInfo } = await settingsModel.get();
    if (!paymentInfo?.trim()) {
      throw conflict("Ajoutez d'abord les numéros de paiement de MoveColis dans les Paramètres de messagerie.");
    }
    return paymentInfo;
  }
  const owner = await userModel.findById(detail.owner.id);
  if (!owner?.paymentInfo?.trim()) {
    throw conflict(
      side === "OWNER"
        ? "Ajoutez d'abord vos numéros de paiement dans votre profil (Profil → Mes numéros de paiement)."
        : "Le voyageur n'a pas encore renseigné ses numéros de paiement dans son profil."
    );
  }
  return owner.paymentInfo;
}

/**
 * Bouton « Envoyer le numéro de paiement » (propriétaire du voyage ou équipe MoveColis) : message dans la
 * conversation avec le montant à payer et les numéros. Le client y répond avec la capture de son paiement.
 * Billet : tant que la demande est « À traiter » · Kilos : tant que le paiement n'est pas reçu.
 */
export async function sendPaymentInfo(conversationId, actor) {
  const { side } = await resolveAccess(conversationId, actor);
  if (side === "CUSTOMER") throw forbidden("Seul le propriétaire du voyage envoie les numéros de paiement.");
  const detail = await conversationModel.findDetail(conversationId);
  const isFlight = detail.kind === "FLIGHT";
  const subject = isFlight ? detail.flightOrder : detail.reservation;
  if (subject.status === "CANCELLED") throw conflict(isFlight ? "Cette demande est annulée." : "Cette réservation est annulée.");
  if (isFlight ? subject.status !== "PENDING" : subject.paidAt) throw conflict("Le paiement est déjà enregistré.");

  const numbers = await paymentNumbersFor(detail, side);
  const text = isFlight
    ? flightOrderService.paymentInfoMessage(subject, numbers)
    : reservationService.paymentInfoMessage(subject, detail.trip, numbers);
  await sendMessage(conversationId, actor, text);

  const paymentInfoSentAt = isFlight
    ? await flightOrderModel.markPaymentInfoSent(subject.id)
    : await reservationModel.markPaymentInfoSent(subject.id);
  // L'en-tête de la conversation (et la liste des demandes de billet) se met à jour en direct
  realtime.emitToConversation(conversationId, isFlight ? "flight-order:updated" : "reservation:updated", {
    conversationId,
    [isFlight ? "flightOrder" : "reservation"]: { id: subject.id, paymentInfoSentAt },
  });
  if (isFlight) realtime.emitToAdmins("flight-orders:updated", {});
  return { paymentInfoSentAt };
}

/** Liste des demandes de billet (admin) : même envoi, renvoie la demande mise à jour */
export async function sendFlightPaymentInfo(flightOrderId, user) {
  const order = await flightOrderModel.findById(flightOrderId);
  if (!order?.conversationId) throw notFound("Demande de billet introuvable.");
  const { paymentInfoSentAt } = await sendPaymentInfo(order.conversationId, { user, guestToken: null });
  return flightOrderService.withPurchaseUrl({ ...order, paymentInfoSentAt });
}

/** Kilos : « Paiement reçu » (propriétaire du voyage ou équipe), indépendant des étapes du colis */
export async function markPaymentReceived(conversationId, actor, note = null) {
  const { side, info } = await resolveAccess(conversationId, actor);
  if (side === "CUSTOMER") throw forbidden("Seul le propriétaire du voyage confirme la réception du paiement.");
  if (!info.reservationId) throw badRequest("Billet d'avion : utilisez « Paiement reçu » de la demande.");
  return reservationService.markPaid(info.reservationId, { actorId: actor.user?.id ?? null, note });
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
    const detail = await conversationModel.findDetail(conversationId);
    const subject = detail.reservation ?? detail.flightOrder; // réservation de kilos ou demande de billet
    const senderName = {
      CUSTOMER: `${subject.clientName}${subject.isGuest ? " (visiteur)" : ""}`,
      OWNER: ownerDisplayName(detail.owner),
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
 * Faire avancer (ou annuler) la réservation — ou la demande de billet — depuis la conversation.
 *  - propriétaire et admin : toutes les étapes du workflow
 *  - client / visiteur     : uniquement annuler, tant que ce n'est pas confirmé
 */
export async function changeReservationStatus(conversationId, actor, nextStatus, note) {
  const { side, info } = await resolveAccess(conversationId, actor);
  if (info.flightOrderId) return changeFlightOrderStatus(info, side, actor, nextStatus, note);
  if (!RESERVATION_STATUSES.includes(nextStatus)) throw badRequest("Statut inconnu pour une réservation.");

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

async function changeFlightOrderStatus(info, side, actor, nextStatus, note) {
  if (side === "CUSTOMER") {
    if (nextStatus !== "CANCELLED") throw forbidden("Seule l'équipe MoveColis peut faire avancer la demande.");
    const order = await flightOrderService.updateStatus(info.flightOrderId, "CANCELLED", {
      actorId: actor.user?.id ?? null,
      note,
      onlyFromStatuses: ["PENDING"],
      cancelledBy: "par le client",
    });
    return flightOrderService.forCustomer(order);
  }
  return flightOrderService.updateStatus(info.flightOrderId, nextStatus, {
    actorId: actor.user.id,
    note,
    cancelledBy: "par l'équipe MoveColis",
  });
}
