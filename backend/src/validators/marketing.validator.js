import { z } from "zod";
import { nullableField } from "./common.js";

const city = z.string().trim().min(2, "Nom de ville trop court.").max(80);
const timezone = z.string().max(64).optional();

/* ---------- Utilisateur ---------- */

// Trajet favori : la destination est obligatoire, la ville de départ facultative (= n'importe laquelle)
export const favoriteBody = z.object({
  departureCity: nullableField(city),
  arrivalCity: city,
});

export const onboardingBody = z.object({
  favorites: z.array(favoriteBody).min(1, "Indiquez au moins une destination.").max(3),
  routeAlerts: z.boolean().default(true),
  campaigns: z.boolean().default(true),
  timezone,
});

export const preferencesBody = z
  .object({ routeAlerts: z.boolean().optional(), campaigns: z.boolean().optional(), timezone })
  .refine((d) => Object.keys(d).length > 0, "Aucune préférence à modifier.");

/* ---------- Admin : campagnes ---------- */

// Lien interne uniquement (jamais vers un autre site : pas d'hameçonnage possible)
const internalLink = z
  .string()
  .trim()
  .max(255)
  .regex(/^\/[^\s]*$/, "Lien interne attendu, commençant par / (ex. /?vers=Abidjan).");

const campaignFields = {
  title: z.string().trim().min(3).max(80, "80 caractères maximum (titre de notification)."),
  body: z.string().trim().min(3).max(200, "200 caractères maximum."),
  link: internalLink.default("/"),
  audience: z.enum(["CLIENTS", "VOYAGEURS", "ALL"]).default("CLIENTS"),
  destinationCity: nullableField(city),
  moment: nullableField(z.string().trim().max(80)),
  scheduledAt: nullableField(z.string().datetime({ offset: true, message: "Date d'envoi invalide." })),
  status: z.enum(["DRAFT", "SCHEDULED"]).default("DRAFT"),
};

export const createCampaignBody = z.object(campaignFields);

export const updateCampaignBody = z
  .object({ ...campaignFields, link: internalLink, audience: z.enum(["CLIENTS", "VOYAGEURS", "ALL"]), status: z.enum(["DRAFT", "SCHEDULED"]) })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Aucun champ à modifier.");

export const audienceQuery = z.object({
  audience: z.enum(["CLIENTS", "VOYAGEURS", "ALL"]).default("CLIENTS"),
  destinationCity: z.string().trim().max(80).optional(),
});
