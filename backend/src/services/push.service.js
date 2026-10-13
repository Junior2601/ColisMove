import webpush from "web-push";
import { env } from "../config/env.js";
import * as pushModel from "../models/pushSubscription.model.js";
import * as marketingModel from "../models/marketing.model.js";

// Fuseau valide ? (ex. "Africa/Abidjan") — sinon ignoré
const validTimezone = (tz) => {
  try {
    return tz && new Intl.DateTimeFormat("en", { timeZone: tz }) && tz;
  } catch {
    return null;
  }
};

/**
 * Web Push : notifications reçues même quand le site (ou l'appli installée) est fermé.
 * Le serveur signe chaque envoi avec sa clé VAPID privée ; le navigateur n'accepte
 * que les messages signés par la clé publique utilisée lors de l'abonnement.
 */
const enabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);

if (enabled) {
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
} else {
  console.warn("⚠️  Push désactivé : VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY absents du .env (npm run vapid:generate).");
}

export const getConfig = () => ({ enabled, publicKey: enabled ? env.vapid.publicKey : null });

export async function subscribe(userId, { endpoint, keys, timezone }, userAgent = null) {
  const tz = validTimezone(timezone);
  if (tz) await marketingModel.updatePreferences(userId, { timezone: tz }); // heures calmes des notifications
  await pushModel.upsert({
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
  });
  return { ok: true };
}

export async function unsubscribe(endpoint) {
  await pushModel.deleteByEndpoint(endpoint);
  return { ok: true };
}

/** Envoie à tous les appareils de l'utilisateur. Ne lève jamais d'erreur. */
export async function sendToUser(userId, payload) {
  if (!enabled) return;
  const subscriptions = await pushModel.listByUser(userId);
  await Promise.allSettled(subscriptions.map((sub) => sendOne(sub, payload)));
}

async function sendOne(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 24 * 3600, urgency: "high" } // gardé 24 h par le service de push si l'appareil est éteint
    );
    await pushModel.touch(sub.id);
  } catch (err) {
    // 404 / 410 : abonnement expiré (appli désinstallée, permission retirée…) → on l'oublie
    if (err.statusCode === 404 || err.statusCode === 410) {
      await pushModel.deleteById(sub.id);
    } else {
      console.warn(`[push] échec d'envoi (${err.statusCode ?? "réseau"}) :`, err.body ?? err.message);
    }
  }
}
