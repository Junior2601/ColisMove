import { z } from "zod";
import { normalizePhone } from "../utils/phone.js";

// Messages Zod par défaut en français (les messages précisés dans les schémas restent prioritaires)
z.setErrorMap((issue, ctx) => {
  if (issue.code === "invalid_type") {
    return { message: issue.received === "undefined" ? "Champ obligatoire." : "Type de valeur invalide." };
  }
  if (issue.code === "too_small") {
    return { message: issue.type === "string" ? `Au moins ${issue.minimum} caractère(s).` : `Valeur trop petite (min. ${issue.minimum}).` };
  }
  if (issue.code === "too_big") {
    return { message: issue.type === "string" ? `Au plus ${issue.maximum} caractère(s).` : `Valeur trop grande (max. ${issue.maximum}).` };
  }
  if (issue.code === "invalid_enum_value") {
    return { message: `Valeur attendue : ${issue.options.join(", ")}.` };
  }
  return { message: ctx.defaultError };
});

// Un champ de formulaire vide "" devient null
export const emptyToNull = (value) => (typeof value === "string" && value.trim() === "" ? null : value);

// Champ facultatif : absent, null ou "" acceptés (→ null)
export const nullableField = (schema) => z.preprocess(emptyToNull, schema.nullable()).optional();

export const idParam = z.object({
  id: z.coerce.number().int().positive().max(2147483647),
});

export const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

// Recherche texte optionnelle ("" → ignorée)
export const searchQuery = z.string().trim().max(80).optional().transform((v) => v || undefined);

// "+225 07 12 34 56 78" → "2250712345678"
export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\d{8,15}$/, "Numéro invalide : format international attendu (ex. +225 07 12 34 56 78)."));
