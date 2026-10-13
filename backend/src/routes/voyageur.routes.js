import { Router } from "express";
import * as voyageur from "../controllers/voyageur.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import { cancelTripBody, createTripBody, updateTripBody } from "../validators/trip.validator.js";
import { listReservationsQuery, updateReservationStatusBody } from "../validators/reservation.validator.js";
import { listOwnTripsQuery } from "../validators/voyageur.validator.js";

const router = Router();

// Toutes les routes /api/voyageur/* : voyageur connecté (authenticate n'accepte que les comptes approuvés)
router.use(authenticate, authorize("VOYAGEUR"));

// TravelerDashboard.jsx
router.get("/stats", voyageur.getStats);

// MesVoyages.jsx + CreateTrip.jsx
router.get("/trips", validate({ query: listOwnTripsQuery }), voyageur.listTrips);
router.post("/trips", validate({ body: createTripBody }), voyageur.createTrip);
router.patch("/trips/:id", validate({ params: idParam, body: updateTripBody }), voyageur.updateTrip);
router.patch("/trips/:id/cancel", validate({ params: idParam, body: cancelTripBody }), voyageur.cancelTrip);
router.delete("/trips/:id", validate({ params: idParam }), voyageur.deleteTrip);

// MesReservations.jsx
router.get("/reservations", validate({ query: listReservationsQuery }), voyageur.listReservations);
router.get("/reservations/:id", validate({ params: idParam }), voyageur.getReservation);
router.patch(
  "/reservations/:id/status",
  validate({ params: idParam, body: updateReservationStatusBody }),
  voyageur.updateReservationStatus
);

export default router;
