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
// Mois de retour d'un aller-retour (absent ou vide : aller simple)
const returnMonthField = z.preprocess(emptyToNull, monthField.nullable()).optional();
// Jour du calendrier "2026-12-15" (date réelle)
const dayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ).")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Date invalide.");
// Le retour ne part pas avant l'aller : mois de retour ≥ mois de départ
const returnAfterDeparture = [
  (data) => !data.returnMonth || data.returnMonth >= data.month,
  { message: "Le mois de retour ne peut pas être avant le mois de départ.", path: ["returnMonth"] },
];
// Vol d'une demande dont on publie les kilos libérés : aller, ou retour d'un aller-retour
export const flightLeg = z.enum(["OUTBOUND", "RETURN"]);
const email = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160);

/* ---------- Côté client ---------- */

export const placesQuery = z.object({
  term: z.string().trim().min(2, "Au moins 2 lettres.").max(40),
});

// Recherche du client : jour de départ (et jour de retour d'un aller-retour) choisis dans le calendrier
export const searchFlightsQuery = z
  .object({
    origin: cityCode,
    destination: cityCode,
    date: dayField,
    returnDate: z.preprocess(emptyToNull, dayField.nullable()).optional(), // aller-retour : retour ce jour-là
    direct: queryBoolean, // vols directs uniquement (à l'aller comme au retour)
  })
  .refine((data) => !data.returnDate || data.returnDate >= data.date, {
    message: "La date de retour ne peut pas être avant la date de départ.",
    path: ["returnDate"],
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

// Coordonnées de la personne qui fait la demande, et passagers (billet de nos résultats ou vol choisi en direct)
const orderContact = {
  clientName: z.string().trim().min(2, "Indiquez votre nom complet.").max(160),
  clientPhone: phoneSchema,
  clientEmail: email, // reçoit le billet une fois émis
  note: nullableField(z.string().trim().max(500)),
  adults: intBetween(1, FLIGHT_MAX_PASSENGERS),
  children: intBetween(0, FLIGHT_MAX_PASSENGERS - 1).default(0),
  infants: intBetween(0, FLIGHT_MAX_PASSENGERS).default(0),
  passengers: z.array(passenger).min(1, "Renseignez chaque passager.").max(FLIGHT_MAX_PASSENGERS),
};

// Heure locale "21:30"
const timeField = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (ex. 21:30).");

/**
 * Vol choisi dans la recherche en direct (page « Vols en direct ») : trajet, jours, ce que le client a vu
 * (compagnie, heures, prix) et, s'il l'a copié avec « Partager », le lien du billet.
 */
export const createLiveFlightOrderBody = z
  .object({
    origin: cityCode,
    destination: cityCode,
    date: dayField,
    returnDate: z.preprocess(emptyToNull, dayField.nullable()).optional(), // aller-retour
    airline: z.string().trim().min(2, "Indiquez la compagnie du vol choisi.").max(80),
    departureTime: nullableField(timeField),
    returnDepartureTime: nullableField(timeField),
    seenPrice: nullableField(z.string().trim().max(40)), // tel qu'affiché, ex. "479 277 Fr"
    shareLink: nullableField(z.string().trim().max(500)), // lien copié avec « Partager »
    ...orderContact,
  })
  .refine((data) => data.destination !== data.origin, {
    message: "Choisissez une ville d'arrivée différente du départ.",
    path: ["destination"],
  })
  .refine((data) => !data.returnDate || data.returnDate >= data.date, {
    message: "La date de retour ne peut pas être avant la date de départ.",
    path: ["returnDate"],
  });

export const createFlightOrderBody = z.object({
  offerId: z.coerce.number().int().positive().max(2147483647),
  ...orderContact,
  options: z
    .array(z.object({ id: z.coerce.number().int().positive(), quantity: intBetween(0, 20) }))
    .max(30)
    .default([]),
  // Valises en soute gardées (tous passagers) : moins que celles incluses = réduction, kilos libérés pour MoveColis
  checkedBags: intBetween(0, 5 * FLIGHT_MAX_PASSENGERS).optional(),
  // Aller-retour : valises gardées sur le vol retour, choisies indépendamment de l'aller
  returnCheckedBags: intBetween(0, 5 * FLIGHT_MAX_PASSENGERS).optional(),
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

export const adminOffersQuery = z
  .object({
    origin: cityCode,
    destination: cityCode,
    month: monthField,
    returnMonth: returnMonthField, // aller-retour : retour ce mois-là
    refresh: queryBoolean, // redemander les prix à Aviasales maintenant
  })
  .refine(...returnAfterDeparture);

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

// Date et heure locales du vol "2026-12-11T21:30" (champ datetime-local)
const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "Date et heure invalides.")
  .refine((value) => {
    const date = new Date(`${value}:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value;
  }, "Date et heure invalides.");
const airportCode = nullableField(
  z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Code de l'aéroport sur 3 lettres (ex. DME).")
);
// Villes d'escale : "Addis Abeba", "Istanbul" (le nombre d'escales en découle)
const stopCities = z.array(z.string().trim().min(2, "Ville d'escale trop courte.").max(60)).max(4).default([]);

/** Demande en direct : vol retrouvé par l'équipe et prix à payer (avant l'envoi du numéro de paiement) */
export const quoteLiveFlightOrderBody = z.object({
  airline: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2}$/, "Code de la compagnie sur 2 caractères (ex. ET)."),
  flightNumber: z.string().trim().toUpperCase().regex(/^\d{1,4}[A-Z]?$/, "Numéro du vol, sans le code de la compagnie (ex. 761)."),
  departureAt: localDateTime,
  arrivalAt: nullableField(localDateTime),
  originAirport: airportCode,
  destinationAirport: airportCode,
  stops: stopCities,
  // Vol retour (aller-retour uniquement)
  returnDepartureAt: nullableField(localDateTime),
  returnArrivalAt: nullableField(localDateTime),
  returnOriginAirport: airportCode,
  returnDestinationAirport: airportCode,
  returnStops: stopCities,
  // Bagages : valises en soute par passager (hors bébés), poids d'une valise, bagage cabine (vide : inclus)
  checkedBags: intBetween(0, 3),
  checkedBagKg: intBetween(1, 50).default(23),
  cabinKg: nullableNumber(intBetween(0, 30)),
  // Prix par passager, dans la devise des billets
  adultPrice: z.coerce.number().positive("Indiquez le prix par adulte.").max(1_000_000_000),
  childPrice: amount.default(0),
  infantPrice: amount.default(0),
});

export const updateFlightOrderStatusBody = z.object({
  status: z.enum(FLIGHT_ORDER_STATUSES),
  note: nullableField(z.string().trim().max(255)),
});

/* ---------- Administration : kilos libérés ---------- */

export const freedKilosQuery = z.object({
  period: z.enum(["upcoming", "past"]).default("upcoming"),
});

// /admin/flights/kilos/:id?leg=RETURN : kilos du vol retour d'un aller-retour
export const freedKilosLegQuery = z.object({
  leg: flightLeg.default("OUTBOUND"),
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
