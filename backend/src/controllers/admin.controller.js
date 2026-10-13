import * as statsService from "../services/stats.service.js";
import * as tripService from "../services/trip.service.js";
import * as reservationService from "../services/reservation.service.js";
import * as travelerService from "../services/traveler.service.js";
import * as settingsService from "../services/settings.service.js";

// Le contrôleur ne fait que traduire HTTP ↔ service.
// Express 5 transmet automatiquement les erreurs des fonctions async au errorHandler : pas de try/catch.

/* ---------- Statistiques ---------- */

export async function getStats(req, res) {
  res.json(await statsService.getOverview());
}

export async function getActorStats(req, res) {
  res.json(await statsService.getActorStats());
}

/* ---------- Voyages ---------- */

export async function listTrips(req, res) {
  res.json(await tripService.listTrips(req.valid.query));
}

export async function createTrip(req, res) {
  const trip = await tripService.createTrip(req.user.id, req.valid.body);
  res.status(201).json(trip);
}

export async function updateTrip(req, res) {
  res.json(await tripService.updateOwnTrip(req.user.id, req.valid.params.id, req.valid.body));
}

export async function cancelTrip(req, res) {
  res.json(
    await tripService.cancelTrip(req.valid.params.id, { actorId: req.user.id, reason: req.valid.body.reason })
  );
}

/* ---------- Réservations ---------- */

export async function listReservations(req, res) {
  res.json(await reservationService.listReservations(req.valid.query));
}

export async function getReservation(req, res) {
  res.json(await reservationService.getReservationDetail(req.valid.params.id));
}

export async function updateReservationStatus(req, res) {
  const { status, note } = req.valid.body;
  res.json(
    await reservationService.updateReservationStatus(req.valid.params.id, status, { actorId: req.user.id, note })
  );
}

/* ---------- Voyageurs ---------- */

export async function listTravelers(req, res) {
  res.json(await travelerService.listTravelers(req.valid.query));
}

export async function updateTravelerStatus(req, res) {
  res.json(await travelerService.updateTravelerStatus(req.valid.params.id, req.valid.body.status));
}

/* ---------- Paramètres ---------- */

export async function getSettings(req, res) {
  res.json(await settingsService.getSettings());
}

export async function updateSettings(req, res) {
  res.json(await settingsService.updateSettings(req.valid.body));
}
