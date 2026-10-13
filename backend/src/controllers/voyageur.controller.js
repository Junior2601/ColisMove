import * as voyageurService from "../services/voyageur.service.js";
import * as tripService from "../services/trip.service.js";
import * as reservationService from "../services/reservation.service.js";

// Tout est filtré par req.user.id côté serveur : jamais par un paramètre envoyé par le navigateur

/* ---------- Tableau de bord ---------- */

export async function getStats(req, res) {
  res.json(await voyageurService.getStats(req.user.id));
}

/* ---------- Mes voyages ---------- */

export async function listTrips(req, res) {
  res.json(await voyageurService.listTrips(req.user.id, req.valid.query));
}

// Même service que l'admin : seul le propriétaire change (le voyageur connecté)
export async function createTrip(req, res) {
  res.status(201).json(await tripService.createTrip(req.user.id, req.valid.body));
}

export async function updateTrip(req, res) {
  res.json(await tripService.updateOwnTrip(req.user.id, req.valid.params.id, req.valid.body));
}

export async function cancelTrip(req, res) {
  res.json(
    await tripService.cancelTrip(req.valid.params.id, {
      actorId: req.user.id,
      reason: req.valid.body.reason,
      onlyOwnerId: req.user.id,
    })
  );
}

export async function deleteTrip(req, res) {
  res.json(await voyageurService.deleteTrip(req.user.id, req.valid.params.id));
}

/* ---------- Réservations reçues ---------- */

export async function listReservations(req, res) {
  res.json(
    await reservationService.listReservations({ ...req.valid.query, ownerId: req.user.id, withOwnerUnread: true })
  );
}

export async function getReservation(req, res) {
  res.json(await reservationService.getReservationDetail(req.valid.params.id, { onlyOwnerId: req.user.id }));
}

export async function updateReservationStatus(req, res) {
  const { status, note } = req.valid.body;
  res.json(
    await reservationService.updateReservationStatus(req.valid.params.id, status, {
      actorId: req.user.id,
      note,
      onlyOwnerId: req.user.id,
      cancelledBy: "par le propriétaire du voyage",
    })
  );
}
