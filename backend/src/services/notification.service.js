import * as notificationModel from "../models/notification.model.js";
import * as conversationModel from "../models/conversation.model.js";
import * as pushService from "./push.service.js";
import * as realtime from "../socket/realtime.js";

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Toutes les notifications liées à une réservation partagent le groupe de sa conversation :
// ouvrir la conversation les marque comme lues
export const conversationGroup = (conversationId) => `conversation:${conversationId}`;

/**
 * Notifie des utilisateurs (comptes uniquement) :
 *  1. enregistre la notification (centre de notifications) — attendu, pour garder l'ordre des événements
 *  2. la diffuse en temps réel aux onglets ouverts (Socket.io)
 *  3. l'envoie en push aux appareils abonnés, même site fermé — en arrière-plan
 */
export async function notify(userIds, { type, title, body = "", link = null, groupKey = null }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const notifications = await Promise.all(
    ids.map((userId) =>
      notificationModel.upsert({ userId, type, title: clip(title, 160), body: clip(body, 300), link, groupKey })
    )
  );
  notifications.forEach((notification, i) => deliver(ids[i], notification));
  return notifications;
}

/** Comme notify, mais une erreur ne fait jamais échouer l'action principale (message, réservation…) */
export async function notifySafely(userIds, data) {
  try {
    return await notify(userIds, data);
  } catch (err) {
    console.error("[notifications]", err);
    return [];
  }
}

function deliver(userId, notification) {
  realtime.emitToUser(userId, "notification:new", notification);

  // Le push part en arrière-plan : l'utilisateur qui agit n'attend pas les serveurs de push
  (async () => {
    // Pastille de l'icône de l'appli = messages non lus (mise à jour par le service worker)
    const badgeCount = await conversationModel.countUnreadForUser(userId);
    await pushService.sendToUser(userId, {
      title: notification.title,
      body: notification.body,
      url: notification.link ?? "/notifications",
      tag: notification.groupKey ?? `notification-${notification.id}`, // remplace la précédente du même groupe
      notificationId: notification.id,
      badgeCount,
    });
  })().catch((err) => console.error("[push]", err));
}

/* ===================== Centre de notifications ===================== */

export async function list(userId, { limit, offset }) {
  const result = await notificationModel.listForUser(userId, { limit, offset });
  return { ...result, limit, offset };
}

// Compteurs de l'en-tête : cloche (notifications) et messagerie (messages non lus = pastille de l'icône)
export async function counts(userId) {
  const [notifications, messages] = await Promise.all([
    notificationModel.countUnread(userId),
    conversationModel.countUnreadForUser(userId),
  ]);
  return { notifications, messages };
}

export async function markRead(userId, id) {
  if (await notificationModel.markRead(id, userId)) {
    realtime.emitToUser(userId, "notifications:changed", {}); // synchronise les autres onglets / appareils
  }
  return { ok: true };
}

export async function markAllRead(userId) {
  const updated = await notificationModel.markAllRead(userId);
  if (updated) realtime.emitToUser(userId, "notifications:changed", {});
  return { updated };
}

export async function markConversationRead(userId, conversationId) {
  if (!userId) return;
  const updated = await notificationModel.markGroupRead(userId, conversationGroup(conversationId));
  if (updated) realtime.emitToUser(userId, "notifications:changed", {});
}
