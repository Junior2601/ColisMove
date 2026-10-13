import { withTransaction } from "../config/db.js";
import * as statsModel from "../models/stats.model.js";
import * as tripModel from "../models/trip.model.js";
import * as reservationModel from "../models/reservation.model.js";
import { RESERVATION_STATUSES } from "../config/constants.js";
import { conflict, forbidden, notFound } from "../utils/AppError.js";

/** Tableau de bord du voyageur : uniquement ses voyages et les réservations reçues dessus */
export async function getStats(ownerId) {
  const [trips, reservations, revenue, upcomingFill] = await Promise.all([
    statsModel.getOwnerTripStats(ownerId),
    statsModel.getOwnerReservationStats(ownerId),
    statsModel.getOwnerRevenue(ownerId),
    statsModel.getOwnerUpcomingFill(ownerId, 5),
  ]);
  return { trips, reservations, revenue, upcomingFill };
}

/** Mes voyages : onglet "upcoming" ou "past", avec les compteurs des deux onglets */
export async function listTrips(ownerId, { period, limit, offset }) {
  const [result, counts] = await Promise.all([
    tripModel.list({ ownerId, period, limit, offset }),
    tripModel.countByOwnerPeriods(ownerId),
  ]);
  return { ...result, counts, limit, offset };
}

/**
 * Supprimer un voyage :
 *  - aucune réservation (même annulée) → suppression définitive
 *  - seulement des réservations annulées → le voyage passe en "annulé" (on garde l'historique)
 *  - des réservations actives → refusé : il faut annuler le voyage (les clients sont prévenus)
 */
export async function deleteTrip(ownerId, tripId) {
  return withTransaction(async (db) => {
    const trip = await tripModel.findByIdForUpdate(tripId, db);
    if (!trip) throw notFound("Voyage introuvable.");
    if (trip.ownerId !== ownerId) throw forbidden("Vous ne pouvez supprimer que vos propres voyages.");

    const all = await reservationModel.countByTripAndStatuses(tripId, RESERVATION_STATUSES, db);
    if (all === 0) {
      await tripModel.deleteById(tripId, db);
      return { deleted: true, trip: null };
    }

    const active = await reservationModel.countByTripAndStatuses(
      tripId, RESERVATION_STATUSES.filter((s) => s !== "CANCELLED"), db
    );
    if (active > 0) {
      throw conflict("Ce voyage a des réservations en cours : annulez-le plutôt, les clients seront prévenus.");
    }
    return { deleted: false, trip: await tripModel.markCancelled(tripId, db) };
  });
}
