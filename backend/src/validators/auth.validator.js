import { z } from "zod";
import { nullableField, phoneSchema } from "./common.js";

// Connexion avec l'email OU le numéro de téléphone
export const loginBody = z.object({
  identifier: z.string().trim().min(3, "Email ou téléphone requis."),
  password: z.string().min(1, "Mot de passe requis."),
});

const personName = z.string().trim().min(1, "Champ obligatoire.").max(80);

// Inscription publique : uniquement CLIENT ou VOYAGEUR (jamais ADMIN)
export const registerBody = z
  .object({
    role: z.enum(["CLIENT", "VOYAGEUR"]),
    firstName: personName,
    lastName: personName,
    email: z.string().trim().toLowerCase().email("Email invalide.").max(160),
    phone: phoneSchema,
    city: nullableField(z.string().trim().min(2, "Nom de ville trop court.").max(80)),
    password: z
      .string()
      .min(8, "8 caractères minimum.")
      .max(72, "72 caractères maximum."), // limite de bcrypt
    // Case cochée obligatoire : "J'accepte les CGU et la politique de confidentialité"
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Vous devez accepter les CGU et la politique de confidentialité." }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.role === "VOYAGEUR" && !data.city) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["city"], message: "Ville de résidence obligatoire." });
    }
  });

/* ===================== Profil ===================== */

export const updateMeBody = z
  .object({
    firstName: personName,
    lastName: personName,
    email: z.string().trim().toLowerCase().email("Email invalide.").max(160),
    phone: phoneSchema,
    city: nullableField(z.string().trim().min(2, "Nom de ville trop court.").max(80)),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Aucun champ à modifier.");

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis."),
  newPassword: z.string().min(8, "8 caractères minimum.").max(72, "72 caractères maximum."),
});

/* ===================== Mot de passe oublié ===================== */

export const forgotPasswordBody = z.object({
  identifier: z.string().trim().min(3, "Email ou téléphone requis.").max(160),
});

// Jeton du lien : 43 caractères base64url
const resetToken = z.string().trim().regex(/^[A-Za-z0-9_-]{30,100}$/, "Lien invalide.");

export const resetTokenBody = z.object({ token: resetToken });

export const resetPasswordBody = z.object({
  token: resetToken,
  password: z.string().min(8, "8 caractères minimum.").max(72, "72 caractères maximum."),
});
