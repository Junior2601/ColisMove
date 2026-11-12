import { Router } from "express";
import * as publicController from "../controllers/public.controller.js";
import * as flight from "../controllers/flight.controller.js";
import { optionalAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { flightSearchLimiter, reservationLimiter } from "../middlewares/rateLimit.js";
import { idParam } from "../validators/common.js";
import { createReservationBody, listPublicTripsQuery, trackingParam } from "../validators/public.validator.js";
import { createFlightOrderBody, placesQuery, searchFlightsQuery } from "../validators/flight.validator.js";

const router = Router();

// Accessible sans compte ; si un token valide est envoyé, req.user est rempli
router.use(optionalAuth);

// Home.jsx / TripDetail.jsx
router.get("/trips", validate({ query: listPublicTripsQuery }), publicController.listTrips);
router.get("/trips/:id", validate({ params: idParam }), publicController.getTrip);

// TripDetail.jsx : réserver (visiteur ou client connecté) → ouvre la conversation
router.post("/reservations", reservationLimiter, validate({ body: createReservationBody }), publicController.createReservation);

// Tracking.jsx
router.get("/tracking/:code", validate({ params: trackingParam }), publicController.getTracking);

// Tous les pays : nom, indicatif téléphonique, drapeau (FlightOffer.jsx : nationalité des passagers, téléphone)
router.get("/countries", publicController.listCountries);

// Billets d'avion (Home.jsx, onglet « Billets d'avion » ; FlightOffer.jsx)
router.get("/flights/config", flight.config);
router.get("/flights/places", flightSearchLimiter, validate({ query: placesQuery }), flight.places);
router.get("/flights/search", flightSearchLimiter, validate({ query: searchFlightsQuery }), flight.search);
router.get("/flights/offers/:id", validate({ params: idParam }), flight.getOffer);
// Demande d'achat (visiteur ou client connecté) → ouvre la conversation avec l'équipe MoveColis
router.post("/flight-orders", reservationLimiter, validate({ body: createFlightOrderBody }), flight.createOrder);

export default router;
