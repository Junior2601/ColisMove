import { z } from "zod";
import { pagination } from "./common.js";

export const listNotificationsQuery = z.object({ ...pagination });

/*
 * Sécurité : le serveur envoie des requêtes vers l'endpoint fourni par le navigateur.
 * On n'accepte donc que les services de push officiels (sinon, n'importe qui pourrait
 * faire appeler une URL interne par notre serveur).
 */
const PUSH_SERVICE = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//i;

const endpoint = z
  .string()
  .url()
  .max(1000)
  .regex(PUSH_SERVICE, "Service de notification non reconnu.");

// Format de PushSubscription.toJSON() côté navigateur
export const pushSubscriptionBody = z.object({
  endpoint,
  timezone: z.string().max(64).optional(), // ex. "Africa/Abidjan", "Europe/Moscow"
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(5).max(100),
  }),
});

export const pushUnsubscribeBody = z.object({ endpoint: z.string().url().max(1000) });
