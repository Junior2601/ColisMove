import { z } from "zod";
import { nullableField } from "./common.js";

// Schémas des voyages, partagés par l'admin et le voyageur (même formulaire CreateTrip)

const city = z.string().trim().min(2, "Nom de ville trop court.").max(80);
// Heure LOCALE de la ville, format <input type="datetime-local"> : 2026-07-25T08:45
const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Date et heure obligatoires.");
const stopDuration = z.string().trim().regex(/^\d{1,2}h[0-5]\d$/, "Format attendu : 3h20.");
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Code devise sur 3 lettres (XOF, EUR…).");

const tripFields = {
  departureCity: city,
  departureAt: localDateTime,
  stopCity: nullableField(city),
  stopDuration: nullableField(stopDuration),
  arrivalCity: city,
  arrivalAt: localDateTime,
  kilosTotal: z.coerce.number().positive("Le nombre de kilos doit être positif.").max(9999),
  pricePerKilo: z.coerce.number().min(0, "Le prix ne peut pas être négatif.").max(9_999_999_999),
};

export const createTripBody = z.object({ ...tripFields, currency: currency.default("XOF") });

export const updateTripBody = z
  .object({ ...tripFields, currency })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Aucun champ à modifier.");

export const cancelTripBody = z.object({
  reason: z.string().trim().max(255).optional(),
});
