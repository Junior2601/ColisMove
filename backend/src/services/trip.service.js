import { withTransaction } from "../config/db.js";
import * as tripModel from "../models/trip.model.js";
import * as reservationModel from "../models/reservation.model.js";
import * as trackingModel from "../models/trackingEvent.model.js";
import * as messageModel from "../models/message.model.js";
import * as conversationModel from "../models/conversation.model.js";
import * as notificationService from "./notification.service.js";
import * as marketingService from "./marketing.service.js";
import * as realtime from "../socket/realtime.js";
import { routeText } from "../utils/names.js";
import { formatLocalDate } from "../utils/date.js";
import { CANCELLABLE_RESERVATION_STATUSES } from "../config/constants.js";
import { todayIso } from "../utils/date.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/AppError.js";

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Règles métier communes à la création et à la modification */
function assertTripIsConsistent(trip) {
  if (Boolean(trip.stopCity) !== Boolean(trip.stopDuration)) {
    throw badRequest("Escale incomplète : renseignez la ville ET la durée d'escale, ou aucune des deux.");
  }
  if (same(trip.departureCity, trip.arrivalCity)) {
    throw badRequest("Les villes de départ et d'arrivée doivent être différentes.");
  }
  if (trip.stopCity && (same(trip.stopCity, trip.departureCity) || same(trip.stopCity, trip.arrivalCity))) {
    throw badRequest("La ville d'escale doit être différente des villes de départ et d'arrivée.");
  }
  // Format "AAAA-MM-JJTHH:mm" : la comparaison de chaînes suit l'ordre chronologique
  if (trip.arrivalAt <= trip.departureAt) {
    throw badRequest("L'arrivée doit être postérieure au départ.");
  }
}

function assertNotInPast(departureAt) {
  if (departureAt.slice(0, 10) < todayIso()) throw badRequest("La date de départ est déjà passée.");
}

export async function listTrips(filters) {
  const result = await tripModel.list(filters);
  return { ...result, limit: filters.limit, offset: filters.offset };
}

/**
 * Création d'un voyage. Réutilisé tel quel par le module voyageur :
 * seul ownerId change (l'admin ou le voyageur connecté).
 */
export async function createTrip(ownerId, data) {
  const trip = { stopCity: null, stopDuration: null, ...data };
  assertTripIsConsistent(trip);
  assertNotInPast(trip.departureAt);
  const created = await tripModel.create({ ...trip, ownerId });
  marketingService.onTripPublishedSafely(created.id); // alertes trajets (envoyées 10 min plus tard)
  return created;
}

/** Modification : uniquement par le propriétaire, uniquement un voyage publié et pas encore parti */
export async function updateOwnTrip(ownerId, tripId, patch) {
  return withTransaction(async (db) => {
    const current = await tripModel.findByIdForUpdate(tripId, db);
    if (!current) throw notFound("Voyage introuvable.");
    if (current.ownerId !== ownerId) throw forbidden("Vous ne pouvez modifier que vos propres voyages.");
    if (current.status !== "PUBLISHED") throw conflict("Seul un voyage publié peut être modifié.");
    if (current.hasDeparted) throw conflict("Ce voyage est déjà parti, il ne peut plus être modifié.");

    const merged = { ...current, ...patch };
    assertTripIsConsistent(merged);
    if (patch.departureAt) assertNotInPast(patch.departureAt);

    if (merged.kilosTotal < current.kilosReserved) {
      throw conflict(`Impossible de descendre sous ${current.kilosReserved} kg : ils sont déjà réservés.`);
    }
    // Les réservations figent leur devise : on ne la change plus une fois des kilos vendus
    if (patch.currency && patch.currency !== current.currency && current.kilosReserved > 0) {
      throw conflict("Impossible de changer la devise : des kilos sont déjà réservés sur ce voyage.");
    }
    // Le prix peut changer : les réservations existantes gardent le prix figé à leur création
    return tripModel.update(tripId, patch, db);
  });
}

/**
 * Annulation d'un voyage : l'admin peut annuler n'importe quel voyage (modération),
 * le voyageur seulement les siens (onlyOwnerId).
 * Les réservations encore annulables sont annulées et tracées dans l'historique.
 * Refusé si des colis sont déjà en vol, arrivés ou livrés.
 */
export async function cancelTrip(tripId, { actorId, reason, onlyOwnerId = null }) {
  const result = await withTransaction(async (db) => {
    const trip = await tripModel.findByIdForUpdate(tripId, db);
    if (!trip) throw notFound("Voyage introuvable.");
    if (onlyOwnerId && trip.ownerId !== onlyOwnerId) throw forbidden("Vous ne pouvez annuler que vos propres voyages.");
    if (trip.status !== "PUBLISHED") throw conflict("Ce voyage n'est plus actif.");

    const alreadyFlying = await reservationModel.countByTripAndStatuses(
      tripId, ["IN_TRANSIT", "ARRIVED", "DELIVERED"], db
    );
    if (alreadyFlying > 0) {
      throw conflict("Des colis de ce voyage sont déjà en vol ou livrés : le voyage ne peut plus être annulé.");
    }

    const cancelled = await reservationModel.cancelByTripAndStatuses(
      tripId, CANCELLABLE_RESERVATION_STATUSES, db
    );
    const cancelledIds = cancelled.map((r) => r.id);
    await trackingModel.createMany(
      cancelledIds,
      { status: "CANCELLED", note: reason || "Voyage annulé", createdBy: actorId },
      db
    );
    const messages = await messageModel.createSystemForReservations(
      cancelledIds,
      `❌ Le voyage a été annulé, votre réservation aussi.${reason ? ` Motif : ${reason}` : ""}`,
      db
    );
    const cancelledTrip = await tripModel.markCancelled(tripId, db);
    return { cancelledTrip, cancelled, messages };
  });

  // Chaque client ayant un compte reçoit une notification (centre + push)
  const conversationIds = await conversationModel.findIdsByReservationIds(result.cancelled.map((r) => r.id));
  const trip = result.cancelledTrip;
  for (const { id, clientId } of result.cancelled) {
    const conversationId = conversationIds.get(id);
    if (!clientId || !conversationId) continue;
    await notificationService.notifySafely([clientId], {
      type: "TRIP_CANCELLED",
      title: "Voyage annulé ❌",
      body: `${routeText(trip)} du ${formatLocalDate(trip.departureAt)} : votre réservation est annulée.${reason ? ` Motif : ${reason}` : ""}`,
      link: `/messages/${conversationId}`,
      groupKey: notificationService.conversationGroup(conversationId),
    });
  }

  // Temps réel : chaque client concerné voit l'annulation dans sa conversation
  for (const { clientId } of result.cancelled) {
    realtime.notifyInbox({ conversationId: null, ownerId: result.cancelledTrip.ownerId, clientId });
  }
  for (const message of result.messages) {
    realtime.emitToConversation(message.conversationId, "message:new", message);
    realtime.emitToConversation(message.conversationId, "reservation:updated", {
      conversationId: message.conversationId,
      reservation: { status: "CANCELLED" },
    });
  }
  return { trip: result.cancelledTrip, cancelledReservations: result.cancelled.length };
}

/* ===================== Voyages publics ===================== */

const isBookable = (trip) => trip.status === "PUBLISHED" && !trip.hasDeparted && trip.kilosAvailable > 0;

export async function listPublicTrips(filters) {
  const result = await tripModel.listPublic(filters);
  return { items: result.items.map((t) => ({ ...t, bookable: true })), total: result.total, limit: filters.limit, offset: filters.offset };
}

export async function getPublicTrip(id) {
  const trip = await tripModel.findPublicById(id);
  if (!trip) throw notFound("Ce voyage n'existe pas ou n'est plus disponible.");
  return { ...trip, bookable: isBookable(trip) };
}
