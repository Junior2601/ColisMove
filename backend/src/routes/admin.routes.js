import { Router } from "express";
import * as admin from "../controllers/admin.controller.js";
import * as marketing from "../controllers/marketing.controller.js";
import * as flight from "../controllers/flight.controller.js";
import express from "express";
import {
  adminOffersQuery,
  createFlightOptionBody,
  freedKilosQuery,
  listFlightOrdersQuery,
  sendFlightTicketBody,
  updateFlightOfferBody,
  updateFlightOptionBody,
  updateFlightOrderStatusBody,
  updateFlightSettingsBody,
} from "../validators/flight.validator.js";
import { audienceQuery, createCampaignBody, updateCampaignBody } from "../validators/marketing.validator.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import {
  cancelTripBody,
  createAdminTripBody,
  listReservationsQuery,
  listTravelersQuery,
  listTripsQuery,
  updateReservationStatusBody,
  sendTestMailBody,
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
router.post("/trips", validate({ body: createAdminTripBody }), admin.createTrip);
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
router.get("/mail", admin.getMailStatus);
router.post("/mail/test", validate({ body: sendTestMailBody }), admin.sendTestMail);

// AdminBillets.jsx : demandes de billets, billets Aviasales modifiables, règles de prix et options
router.get("/flight-orders", validate({ query: listFlightOrdersQuery }), flight.listOrders);
router.patch(
  "/flight-orders/:id/status",
  validate({ params: idParam, body: updateFlightOrderStatusBody }),
  flight.updateOrderStatus
);
// Numéros de paiement (réglages) envoyés au client dans la conversation, avant « Paiement reçu »
router.post("/flight-orders/:id/payment-info", validate({ params: idParam }), flight.sendPaymentInfo);
// Billet + reçu envoyés par e-mail (passe la demande à « Billet émis ») ; pièces jointes : corps plus lourd (voir app.js)
router.post(
  "/flight-orders/:id/ticket",
  express.json({ limit: "12mb" }),
  validate({ params: idParam, body: sendFlightTicketBody }),
  flight.sendTicket
);
// Kilos libérés par les valises que les clients ont retirées de leur billet
router.get("/flights/kilos", validate({ query: freedKilosQuery }), flight.listFreedKilos);
router.get("/flights/kilos/:id", validate({ params: idParam }), flight.getFreedKilos);
router.get("/flights/searches", flight.recentSearches);
router.get("/flights/offers", validate({ query: adminOffersQuery }), flight.listOffers);
router.patch("/flights/offers/:id", validate({ params: idParam, body: updateFlightOfferBody }), flight.updateOffer);
router.get("/flights/settings", flight.getSettings);
router.patch("/flights/settings", validate({ body: updateFlightSettingsBody }), flight.updateSettings);
router.post("/flights/options", validate({ body: createFlightOptionBody }), flight.createOption);
router.patch("/flights/options/:id", validate({ params: idParam, body: updateFlightOptionBody }), flight.updateOption);
router.delete("/flights/options/:id", validate({ params: idParam }), flight.deleteOption);

export default router;
