import { Router } from "express";
import * as admin from "../controllers/admin.controller.js";
import * as marketing from "../controllers/marketing.controller.js";
import { audienceQuery, createCampaignBody, updateCampaignBody } from "../validators/marketing.validator.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import {
  cancelTripBody,
  createTripBody,
  listReservationsQuery,
  listTravelersQuery,
  listTripsQuery,
  updateReservationStatusBody,
  updateSettingsBody,
  updateTravelerStatusBody,
  updateTripBody,
} from "../validators/admin.validator.js";

const router = Router();

// Toutes les routes /api/admin/* : connecté ET rôle ADMIN
router.use(authenticate, authorize("ADMIN"));

// AdminDashboard.jsx
router.get("/stats", admin.getStats);
router.get("/stats/actors", admin.getActorStats);

// AdminVoyages.jsx (+ CreateTrip.jsx quand l'admin publie)
router.get("/trips", validate({ query: listTripsQuery }), admin.listTrips);
router.post("/trips", validate({ body: createTripBody }), admin.createTrip);
router.patch("/trips/:id", validate({ params: idParam, body: updateTripBody }), admin.updateTrip);
router.patch("/trips/:id/cancel", validate({ params: idParam, body: cancelTripBody }), admin.cancelTrip);

// AdminReservations.jsx
router.get("/reservations", validate({ query: listReservationsQuery }), admin.listReservations);
router.get("/reservations/:id", validate({ params: idParam }), admin.getReservation);
router.patch(
  "/reservations/:id/status",
  validate({ params: idParam, body: updateReservationStatusBody }),
  admin.updateReservationStatus
);

// Approbations.jsx (+ bloc "Demandes en attente" du dashboard avec ?status=PENDING&limit=3)
router.get("/travelers", validate({ query: listTravelersQuery }), admin.listTravelers);
router.patch(
  "/travelers/:id/status",
  validate({ params: idParam, body: updateTravelerStatusBody }),
  admin.updateTravelerStatus
);

// Campagnes.jsx : campagnes saisonnières et statistiques des notifications automatiques
router.get("/campaigns", marketing.listCampaigns);
router.get("/campaigns/audience", validate({ query: audienceQuery }), marketing.audience);
router.post("/campaigns", validate({ body: createCampaignBody }), marketing.createCampaign);
router.patch("/campaigns/:id", validate({ params: idParam, body: updateCampaignBody }), marketing.updateCampaign);
router.post("/campaigns/:id/cancel", validate({ params: idParam }), marketing.cancelCampaign);
router.get("/marketing/stats", marketing.stats);

// Parametres.jsx
router.get("/settings", admin.getSettings);
router.patch("/settings", validate({ body: updateSettingsBody }), admin.updateSettings);

export default router;
