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
const email = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160);

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

// "1990-03-12" : date réelle du calendrier, après 1900
const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01";
  }, "Date de naissance invalide.");

// Passager, tel qu'écrit sur son passeport (le type doit correspondre au nombre d'adultes, enfants et bébés)
const passenger = z.object({
  type: z.enum(["ADULT", "CHILD", "INFANT"]),
  fullName: z.string().trim().min(2, "Nom et prénoms du passager, comme sur le passeport.").max(120),
  gender: z.enum(["M", "F"], { errorMap: () => ({ message: "Choisissez M ou F." }) }),
  birthDate,
  nationality: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choisissez un pays dans la liste."),
  passportNumber: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^[A-Z0-9]{5,20}$/, "Numéro de passeport : 5 à 20 lettres ou chiffres.")),
});

export const createFlightOrderBody = z.object({
  offerId: z.coerce.number().int().positive().max(2147483647),
  clientName: z.string().trim().min(2, "Indiquez votre nom complet.").max(160),
  clientPhone: phoneSchema,
  clientEmail: email, // reçoit le billet une fois émis
  note: nullableField(z.string().trim().max(500)),
  adults: intBetween(1, FLIGHT_MAX_PASSENGERS),
  children: intBetween(0, FLIGHT_MAX_PASSENGERS - 1).default(0),
  infants: intBetween(0, FLIGHT_MAX_PASSENGERS).default(0),
  passengers: z.array(passenger).min(1, "Renseignez chaque passager.").max(FLIGHT_MAX_PASSENGERS),
  options: z
    .array(z.object({ id: z.coerce.number().int().positive(), quantity: intBetween(0, 20) }))
    .max(30)
    .default([]),
  // Valises en soute gardées (tous passagers) : moins que celles incluses = réduction, kilos libérés pour MoveColis
  checkedBags: intBetween(0, 5 * FLIGHT_MAX_PASSENGERS).optional(),
  expectedTotal: z.coerce.number().nonnegative().optional(), // total affiché au client : refusé s'il a changé
});

/* ---------- Administration : règles des billets ---------- */

export const updateFlightSettingsBody = z
  .object({
    enabled: z.boolean().optional(),
    sourceCurrency: z.enum(FLIGHT_SOURCE_CURRENCIES).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Code de devise sur 3 lettres (ex. XOF).").optional(),
    exchangeRate: z.coerce.number().positive("Le taux doit être positif.").max(1_000_000).optional(),
    childPercent: z.coerce.number().min(0).max(100).optional(),
    infantPercent: z.coerce.number().min(0).max(100).optional(),
    defaultCheckedBags: intBetween(0, 5).optional(),
    defaultCabinKg: intBetween(0, 30).optional(),
    checkedBagKg: intBetween(1, 50).optional(),
    bagRefund: amount.optional(), // réduction par valise retirée par le client (0 = impossible)
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

/* ---------- Administration : kilos libérés ---------- */

export const freedKilosQuery = z.object({
  period: z.enum(["upcoming", "past"]).default("upcoming"),
});

/* ---------- Administration : envoi du billet par e-mail ---------- */

// Pièces jointes du billet (e-ticket de la compagnie, reçu de l'agence…), envoyées en base64 dans le JSON
export const TICKET_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const TICKET_MAX_FILES = 5;
export const TICKET_MAX_BYTES = 8 * 1024 * 1024; // total des fichiers, avant encodage

const attachment = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .transform((name) => name.replace(/[^\p{L}\p{N} ._()-]/gu, "_")), // lettres, chiffres, espaces, . _ ( ) -
  contentType: z.enum(TICKET_FILE_TYPES, { errorMap: () => ({ message: "Fichier PDF, JPG ou PNG uniquement." }) }),
  data: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "Fichier illisible."),
});

export const sendFlightTicketBody = z
  .object({
    email,
    note: nullableField(z.string().trim().max(255)), // ex. numéro de réservation (PNR), visible dans la conversation
    attachments: z.array(attachment).max(TICKET_MAX_FILES, `${TICKET_MAX_FILES} fichiers au maximum.`).default([]),
  })
  .refine(
    (data) => data.attachments.reduce((sum, file) => sum + Math.floor((file.data.length * 3) / 4), 0) <= TICKET_MAX_BYTES,
    { message: "Fichiers trop lourds : 8 Mo au total au maximum.", path: ["attachments"] }
  );
