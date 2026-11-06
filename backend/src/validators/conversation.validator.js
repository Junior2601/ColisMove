import { z } from "zod";
import { nullableField, pagination } from "./common.js";
import { FLIGHT_ORDER_STATUSES, RESERVATION_STATUSES } from "../config/constants.js";

export const listConversationsQuery = z.object({
  scope: z.enum(["all", "mine"]).optional(), // admin : toutes ou seulement ses voyages
  ...pagination,
});

export const messagesQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const sendMessageBody = z.object({
  body: z.string().trim().min(1, "Le message est vide.").max(2000, "2000 caractères maximum."),
  clientId: z.string().max(64).optional(),
});

// Statuts d'une réservation de kilos ou d'une demande de billet (le service vérifie selon la conversation)
const CONVERSATION_STATUSES = [...new Set([...RESERVATION_STATUSES, ...FLIGHT_ORDER_STATUSES])];

export const changeStatusBody = z.object({
  status: z.enum(CONVERSATION_STATUSES),
  note: nullableField(z.string().trim().max(255)),
});
