import * as tripService from "../services/trip.service.js";
import * as reservationService from "../services/reservation.service.js";
import * as marketingService from "../services/marketing.service.js";

export async function listTrips(req, res) {
  const filters = req.valid.query;
  res.json(await tripService.listPublicTrips(filters));
  // Recherche d'un client connecté → future alerte d'itinéraire (une ville seule = destination)
  if (filters.offset === 0) {
    marketingService.recordInterest(
      req.user,
      filters.from || filters.to
        ? { departureCity: filters.from, arrivalCity: filters.to }
        : { arrivalCity: filters.q || filters.city },
      "SEARCH"
    );
  }
}

export async function getTrip(req, res) {
  const trip = await tripService.getPublicTrip(req.valid.params.id);
  res.json(trip);
  // Voyage consulté par un client → « Nouveau voyageur sur un trajet que vous avez consulté »
  marketingService.recordInterest(req.user, trip, "VIEW");
}

// req.user : client connecté, ou null pour un visiteur
export async function createReservation(req, res) {
  const result = await reservationService.createReservation(req.valid.body, { user: req.user });
  res.status(201).json(result);
  // Trajet déjà réservé : intérêt fort (sélection de la semaine, alertes)
  marketingService.recordInterest(req.user, result.reservation.trip, "RESERVATION");
}

export async function getTracking(req, res) {
  res.json(await reservationService.getTracking(req.valid.params.code, { user: req.user }));
}
