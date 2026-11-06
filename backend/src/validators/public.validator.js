import { z } from "zod";
import { nullableField, phoneSchema, queryBoolean, searchQuery } from "./common.js";

export const listPublicTripsQuery = z.object({
  q: searchQuery, // ville de départ, d'escale ou d'arrivée
  from: searchQuery, // "Abidjan → Moscou" : le frontend découpe en from / to
  to: searchQuery,
  city: searchQuery, // pastille de ville : départ OU arrivée exactement
  direct: queryBoolean,
  week: queryBoolean, // départ dans les 7 jours
  limit: z.coerce.number().int().min(1).max(60).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createReservationBody = z.object({
  tripId: z.coerce.number().int().positive(),
  clientName: z.string().trim().min(2, "Indiquez votre nom complet.").max(160),
  clientPhone: phoneSchema,
  parcelDescription: nullableField(z.string().trim().max(500)),
  kilos: z.coerce.number().positive("Au moins un kilo.").max(999),
});

export const trackingParam = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    // MC-… ; les codes KF-… créés avant le passage à MoveColis restent valides
    .regex(/^(MC|KF)-\d{8}-[A-Z0-9]{3,6}$/, "Code de suivi invalide (format MC-AAAAMMJJ-XXXX)."),
});
