import { z } from "zod";
import { emptyToNull, nullableField, pagination, phoneSchema, queryBoolean, searchQuery } from "./common.js";
import { FLIGHT_MAX_PASSENGERS, FLIGHT_ORDER_STATUSES, FLIGHT_SOURCE_CURRENCIES } from "../config/constants.js";

const cityCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Choisissez une ville dans la liste.");
const monthField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois invalide (format AAAA-MM).");
const amount = z.coerce.number().min(0, "Montant positif attendu.").max(1_000_000_000);
const intBetween = (min, max) => z.coerce.number().int().min(min).max(max);
// Champ « vide = règle générale » : "", null → null
const nullableNumber = (schema) => z.preprocess(emptyToNull, schema.nullable()).optional();
const atLeastOneField = (data) => Object.values(data).some((value) => value !== undefined);

/* ---------- Côté client ---------- */

export const placesQuery = z.object({
  term: z.string().trim().min(2, "Au moins 2 lettres.").max(40),
});

export const searchFlightsQuery = z.object({
  origin: cityCode,
  destination: cityCode,
  month: monthField,
  direct: queryBoolean, // vols directs uniquement
});

export const createFlightOrderBody = z.object({
  offerId: z.coerce.number().int().positive().max(2147483647),
  clientName: z.string().trim().min(2, "Indiquez votre nom complet.").max(160),
  clientPhone: phoneSchema,
  note: nullableField(z.string().trim().max(500)),
  adults: intBetween(1, FLIGHT_MAX_PASSENGERS),
  children: intBetween(0, FLIGHT_MAX_PASSENGERS - 1).default(0),
  infants: intBetween(0, FLIGHT_MAX_PASSENGERS).default(0),
  options: z
    .array(z.object({ id: z.coerce.number().int().positive(), quantity: intBetween(0, 20) }))
    .max(30)
    .default([]),
  expectedTotal: z.coerce.number().nonnegative().optional(), // total affiché au client : refusé s'il a changé
});

/* ---------- Administration : règles de prix ---------- */

export const updateFlightSettingsBody = z
  .object({
    enabled: z.boolean().optional(),
    sourceCurrency: z.enum(FLIGHT_SOURCE_CURRENCIES).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Code de devise sur 3 lettres (ex. XOF).").optional(),
    exchangeRate: z.coerce.number().positive("Le taux doit être positif.").max(1_000_000).optional(),
    markupPercent: z.coerce.number().min(0).max(300).optional(),
    serviceFee: amount.optional(),
    roundTo: amount.optional(),
    childPercent: z.coerce.number().min(0).max(100).optional(),
    infantPercent: z.coerce.number().min(0).max(100).optional(),
    defaultCheckedBags: intBetween(0, 5).optional(),
    defaultCabinKg: intBetween(0, 30).optional(),
    checkedBagKg: intBetween(1, 50).optional(),
    cacheHours: intBetween(1, 72).optional(),
    minHoursBeforeDeparture: intBetween(1, 720).optional(),
  })
  .refine(atLeastOneField, "Aucun champ à modifier.");

export const createFlightOptionBody = z.object({
  label: z.string().trim().min(2).max(80),
  description: nullableField(z.string().trim().max(255)),
  price: amount,
  unit: z.enum(["BOOKING", "PASSENGER"]).default("BOOKING"),
  maxQuantity: intBetween(1, 20).default(1),
  active: z.boolean().optional(),
  position: intBetween(0, 1000).optional(),
});

export const updateFlightOptionBody = createFlightOptionBody.partial().refine(atLeastOneField, "Aucun champ à modifier.");

/* ---------- Administration : billets ---------- */

export const adminOffersQuery = z.object({
  origin: cityCode,
  destination: cityCode,
  month: monthField,
  refresh: queryBoolean, // redemander les prix à Aviasales maintenant
});

export const updateFlightOfferBody = z
  .object({
    priceOverride: nullableNumber(amount), // null = prix calculé par les règles
    checkedBags: nullableNumber(intBetween(0, 5)),
    cabinKg: nullableNumber(intBetween(0, 30)),
    info: nullableField(z.string().trim().max(160)),
    hidden: z.boolean().optional(),
  })
  .refine(atLeastOneField, "Aucun champ à modifier.");

/* ---------- Administration : demandes ---------- */

// ?status=PENDING,PAID → ["PENDING", "PAID"]
const statusList = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const list = value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return list.length ? list : undefined;
}, z.array(z.enum(FLIGHT_ORDER_STATUSES)).optional());

export const listFlightOrdersQuery = z.object({
  status: statusList,
  q: searchQuery,
  ...pagination,
});

export const updateFlightOrderStatusBody = z.object({
  status: z.enum(FLIGHT_ORDER_STATUSES),
  note: nullableField(z.string().trim().max(255)),
});
