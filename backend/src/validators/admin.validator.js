import { z } from "zod";
import { emptyToNull, pagination, phoneSchema, searchQuery } from "./common.js";
import { TRIP_STATUSES, USER_STATUSES } from "../config/constants.js";
import { createTripBody } from "./trip.validator.js";

/* ---------- Voyages (schémas partagés avec le voyageur) ---------- */

export { cancelTripBody, updateTripBody } from "./trip.validator.js";

// L'admin peut publier les kilos libérés par les valises retirées sur un billet vendu (espace « Kilos disponibles »)
export const createAdminTripBody = createTripBody.extend({
  flightOrderId: z.coerce.number().int().positive().max(2147483647).optional(),
});

export const listTripsQuery = z.object({
  q: searchQuery,
  ownerId: z.coerce.number().int().positive().optional(),
  ownerRole: z.enum(["ADMIN", "VOYAGEUR"]).optional(), // "MoveColis" = ADMIN
  status: z.enum(TRIP_STATUSES).optional(),
  period: z.enum(["upcoming", "past"]).optional(),
  ...pagination,
});

/* ---------- Réservations (schémas partagés avec le voyageur) ---------- */

export { listReservationsQuery, updateReservationStatusBody } from "./reservation.validator.js";

/* ---------- Voyageurs ---------- */

export const listTravelersQuery = z.object({
  status: z.enum(USER_STATUSES).optional(),
  q: searchQuery,
  ...pagination,
});

export const updateTravelerStatusBody = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

/* ---------- Paramètres ---------- */

export const updateSettingsBody = z
  .object({
    supportWhatsapp: z.preprocess(emptyToNull, phoneSchema.nullable()).optional(),
    reservationMessageTemplate: z.string().trim().min(10).max(1000).optional(),
    // Numéros de paiement de MoveColis (« Orange Money : +225 07… (Nom) », un par ligne)
    paymentInfo: z.string().trim().max(1000, "1000 caractères maximum.").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Aucun champ à modifier.");

/* ---------- E-mails ---------- */

// E-mail de test : à l'adresse de l'admin connecté si aucune n'est donnée
export const sendTestMailBody = z.object({
  to: z.preprocess(emptyToNull, z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160).nullable()).optional(),
});
