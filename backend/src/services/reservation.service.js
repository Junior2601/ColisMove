import { withTransaction } from "../config/db.js";
import * as reservationModel from "../models/reservation.model.js";
import * as tripModel from "../models/trip.model.js";
import * as trackingModel from "../models/trackingEvent.model.js";
import * as conversationModel from "../models/conversation.model.js";
import * as messageModel from "../models/message.model.js";
import * as settingsModel from "../models/settings.model.js";
import * as notificationService from "./notification.service.js";
import * as realtime from "../socket/realtime.js";
import { paths } from "../utils/hashid.js";
import { routeText } from "../utils/names.js";
import {
  RESERVATION_STATUS_LABELS as LABELS,
  RESERVATION_TRANSITIONS,
  STATUS_NOTIFICATION_TITLES,
  STATUS_SYSTEM_MESSAGES,
} from "../config/constants.js";
import { generateTrackingCode } from "../utils/trackingCode.js";
import { generateToken, hashToken } from "../utils/token.js";
import { interpolate } from "../utils/template.js";
import { formatLocalDate } from "../utils/date.js";
import { AppError, conflict, forbidden, notFound } from "../utils/AppError.js";

/* ===================== Admin ===================== */

export async function listReservations(filters) {
  const result = await reservationModel.list(filters);
  return { ...result, limit: filters.limit, offset: filters.offset };
}

// onlyOwnerId : un voyageur ne voit que les réservations de ses voyages (404 sinon, sans rien révéler)
export async function getReservationDetail(id, { onlyOwnerId = null } = {}) {
  const reservation = await reservationModel.findById(id);
  if (!reservation || (onlyOwnerId && reservation.trip.owner.id !== onlyOwnerId)) {
    throw notFound("Réservation introuvable.");
  }
  const history = await trackingModel.listByReservation(id);
  return { ...reservation, history };
}

/* ===================== Réservation publique ===================== */

/**
 * Réservation par un visiteur (user = null) ou un client connecté.
 * Une seule transaction : verrou du voyage, réservation, kilos, suivi, conversation, premier message.
 * Un visiteur reçoit un jeton secret (une seule fois) pour accéder à sa conversation.
 */
export async function createReservation(input, { user = null } = {}) {
  if (user && user.role !== "CLIENT") {
    throw forbidden("Les réservations se font avec un compte client ou sans compte.");
  }
  const kilos = Math.round(input.kilos * 100) / 100;

  const created = await withTransaction(async (db) => {
    const trip = await tripModel.findForBooking(input.tripId, db);
    if (!trip || trip.status !== "PUBLISHED" || trip.ownerStatus !== "APPROVED") {
      throw notFound("Ce voyage n'est plus disponible.");
    }
    if (trip.hasDeparted) throw conflict("Ce voyage est déjà parti.");
    if (kilos > trip.kilosAvailable) {
      throw conflict(
        trip.kilosAvailable > 0 ? `Il ne reste que ${trip.kilosAvailable} kg sur ce voyage.` : "Ce voyage est complet."
      );
    }

    // Code de suivi unique : nouvel essai en cas de collision (rarissime)
    let reservationId = null;
    let trackingCode;
    for (let attempt = 0; attempt < 5 && !reservationId; attempt++) {
      trackingCode = generateTrackingCode();
      reservationId = await reservationModel.create(
        {
          trackingCode,
          tripId: trip.id,
          clientId: user?.id ?? null,
          clientName: input.clientName,
          clientPhone: input.clientPhone,
          parcelDescription: input.parcelDescription,
          kilos,
        },
        db
      );
    }
    if (!reservationId) throw new AppError(503, "Réessayez dans un instant.");

    await tripModel.addReservedKilos(trip.id, kilos, db);
    await trackingModel.create({ reservationId, status: "PENDING", createdBy: user?.id ?? null }, db);

    // Conversation : le visiteur y accède avec un jeton secret, dont on ne garde que l'empreinte
    const guestToken = user ? null : generateToken();
    const conversationId = await conversationModel.create(
      { reservationId, guestTokenHash: guestToken ? hashToken(guestToken) : null },
      db
    );

    // Premier message, rédigé à partir du modèle défini par l'admin
    const settings = await settingsModel.get(db);
    const body = interpolate(settings.reservationMessageTemplate, {
      kilos: String(kilos).replace(".", ","),
      trajet: `${trip.departureCity} → ${trip.arrivalCity}`,
      date: formatLocalDate(trip.departureAt),
      nom: input.clientName,
      code: trackingCode,
    });
    await messageModel.create({ conversationId, senderType: "CUSTOMER", senderId: user?.id ?? null, body }, db);

    return {
      reservationId,
      conversationId,
      guestToken,
      ownerId: trip.ownerId,
      summary: `${input.clientName} · ${String(kilos).replace(".", ",")} kg · ${routeText(trip)} du ${formatLocalDate(trip.departureAt)}`,
    };
  });

  // Le propriétaire est prévenu (centre de notifications + push) et voit la conversation arriver en direct
  await notificationService.notifySafely([created.ownerId], {
    type: "NEW_RESERVATION",
    title: "Nouvelle réservation 📦",
    body: created.summary,
    link: paths.conversation(created.conversationId),
    groupKey: notificationService.conversationGroup(created.conversationId),
  });
  realtime.notifyInbox({ conversationId: created.conversationId, ownerId: created.ownerId, clientId: user?.id });

  const reservation = await reservationModel.findById(created.reservationId);
  return { reservation, conversationId: created.conversationId, guestToken: created.guestToken };
}

/**
 * Suivi par code. Visiteur : les grandes étapes seulement.
 * Client concerné, propriétaire du voyage ou admin : notes, montant et accès à la conversation.
 */
export async function getTracking(code, { user = null } = {}) {
  const r = await reservationModel.findByTrackingCode(code);
  if (!r) throw notFound("Aucun colis ne correspond à ce code de suivi.");

  const detailed = Boolean(
    user && (user.role === "ADMIN" || user.id === r.clientId || user.id === r.trip.owner.id)
  );
  const events = await trackingModel.listByReservation(r.id);

  return {
    trackingCode: r.trackingCode,
    kilos: r.kilos,
    status: r.status,
    createdAt: r.createdAt,
    trip: {
      departureCity: r.trip.departureCity,
      arrivalCity: r.trip.arrivalCity,
      stopCity: r.trip.stopCity,
      departureAt: r.trip.departureAt,
      arrivalAt: r.trip.arrivalAt,
    },
    history: events.map((e) => ({ status: e.status, createdAt: e.createdAt, ...(detailed && { note: e.note }) })),
    detailed,
    ...(detailed && {
      conversationId: r.conversationId,
      clientName: r.clientName,
      parcelDescription: r.parcelDescription,
      totalAmount: r.totalAmount,
      currency: r.currency,
    }),
  };
}

/* ===================== Workflow des statuts ===================== */

/**
 * Change le statut d'une réservation en respectant le workflow, l'inscrit dans l'historique
 * et poste un message automatique dans la conversation.
 * Options :
 *  - onlyOwnerId      : refuse si la réservation n'est pas sur un voyage de cet utilisateur
 *  - onlyFromStatuses : statuts de départ autorisés (ex. un client n'annule qu'une réservation PENDING)
 *  - cancelledBy      : précision ajoutée au message d'annulation ("par le client")
 */
export async function updateReservationStatus(
  id,
  nextStatus,
  { actorId = null, note = null, onlyOwnerId = null, onlyFromStatuses = null, cancelledBy = null } = {}
) {
  const { updated, messages } = await withTransaction(async (db) => {
    const current = await reservationModel.findByIdForUpdate(id, db);
    if (!current) throw notFound("Réservation introuvable.");
    if (onlyOwnerId && current.tripOwnerId !== onlyOwnerId) {
      throw forbidden("Cette réservation ne concerne pas l'un de vos voyages.");
    }
    if (onlyFromStatuses && !onlyFromStatuses.includes(current.status)) {
      throw conflict(
        `Réservation déjà « ${LABELS[current.status]} » : écrivez au propriétaire du voyage dans la conversation.`
      );
    }

    const allowed = RESERVATION_TRANSITIONS[current.status];
    if (!allowed.includes(nextStatus)) {
      const possible = allowed.map((s) => `« ${LABELS[s]} »`).join(", ") || "aucun (statut final)";
      throw conflict(`Impossible de passer de « ${LABELS[current.status]} » à « ${LABELS[nextStatus]} ». Possible : ${possible}.`);
    }

    if (nextStatus === "CANCELLED") {
      await tripModel.addReservedKilos(current.tripId, -current.kilos, db);
    }
    await reservationModel.updateStatus(id, nextStatus, db);
    await trackingModel.create({ reservationId: id, status: nextStatus, note, createdBy: actorId }, db);

    let text = STATUS_SYSTEM_MESSAGES[nextStatus];
    if (nextStatus === "CANCELLED" && cancelledBy) text = text.replace(/\.$/, ` ${cancelledBy}.`);
    if (note) text += ` — ${note}`;
    const systemMessages = await messageModel.createSystemForReservations([id], text, db);

    return { updated: await reservationModel.findById(id, db), messages: systemMessages };
  });

  // Notification d'étape : au client (s'il a un compte) et au propriétaire, sauf à l'auteur du changement
  await notifyStatusChange(updated, { actorId, note, cancelledBy });

  // Temps réel : message système + nouveau statut dans l'en-tête de la conversation
  realtime.publishMessages(messages, { ownerId: updated.trip.owner.id, clientId: updated.clientId });
  if (updated.conversationId) {
    realtime.emitToConversation(updated.conversationId, "reservation:updated", {
      conversationId: updated.conversationId,
      reservation: { id: updated.id, status: updated.status },
    });
  }
  return updated;
}

/**
 * Étapes du colis : le client reçoit "Votre colis est en vol ✈️"…, le propriétaire est prévenu
 * quand quelqu'un d'autre (client qui annule, admin) change le statut d'une réservation de son voyage.
 */
async function notifyStatusChange(reservation, { actorId, note, cancelledBy }) {
  if (!reservation.conversationId) return;
  const recipients = [reservation.clientId, reservation.trip.owner.id].filter((id) => id && id !== actorId);
  if (!recipients.length) return;

  let title = STATUS_NOTIFICATION_TITLES[reservation.status];
  if (reservation.status === "CANCELLED" && cancelledBy) title = `Réservation annulée ${cancelledBy}`;

  await notificationService.notifySafely(recipients, {
    type: "RESERVATION_STATUS",
    title,
    body: `${reservation.trackingCode} · ${reservation.clientName} · ${routeText(reservation.trip)}${note ? ` — ${note}` : ""}`,
    link: paths.conversation(reservation.conversationId),
    groupKey: notificationService.conversationGroup(reservation.conversationId),
  });
}
