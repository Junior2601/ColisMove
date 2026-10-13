import { z } from "zod";
import { nullableField, pagination } from "./common.js";
import { RESERVATION_STATUSES } from "../config/constants.js";

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

export const changeStatusBody = z.object({
  status: z.enum(RESERVATION_STATUSES),
  note: nullableField(z.string().trim().max(255)),
});
