import { Router } from "express";
import * as publicController from "../controllers/public.controller.js";
import { optionalAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import { createReservationBody, listPublicTripsQuery, trackingParam } from "../validators/public.validator.js";

const router = Router();

// Accessible sans compte ; si un token valide est envoyé, req.user est rempli
router.use(optionalAuth);

// Home.jsx / TripDetail.jsx
router.get("/trips", validate({ query: listPublicTripsQuery }), publicController.listTrips);
router.get("/trips/:id", validate({ params: idParam }), publicController.getTrip);

// TripDetail.jsx : réserver (visiteur ou client connecté) → ouvre la conversation
router.post("/reservations", validate({ body: createReservationBody }), publicController.createReservation);

// Tracking.jsx
router.get("/tracking/:code", validate({ params: trackingParam }), publicController.getTracking);

export default router;
