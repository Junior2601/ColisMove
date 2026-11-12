import { api } from "./client";
import { getGuestToken } from "../lib/guestAccess";

// Un visiteur prouve son accès avec le jeton reçu à la réservation
const guestOptions = (conversationId) => {
  const token = getGuestToken(conversationId);
  return token ? { headers: { "X-Guest-Token": token } } : undefined;
};

export const conversationsApi = {
  // Boîte de réception (comptes uniquement)
  list: (params) => api.get("/conversations", params),
  unreadCount: () => api.get("/conversations/unread-count"),

  // Une conversation (compte participant, admin ou visiteur muni de son jeton)
  get: (id) => api.get(`/conversations/${id}`, undefined, guestOptions(id)),
  messages: (id, params) => api.get(`/conversations/${id}/messages`, params, guestOptions(id)),
  send: (id, body, clientId) => api.post(`/conversations/${id}/messages`, { body, clientId }, guestOptions(id)),
  // Photo (demande de billet) : params = { caption, width, height, clientId } → message créé
  sendImage: (id, file, params) => api.upload(`/conversations/${id}/images`, file, params, guestOptions(id)),
  attachment: (id, attachmentId) => api.blob(`/conversations/${id}/attachments/${attachmentId}`, guestOptions(id)),
  // Paiement (propriétaire du voyage ou équipe) : numéros envoyés au client → { paymentInfoSentAt }
  sendPaymentInfo: (id) => api.post(`/conversations/${id}/payment-info`),
  // Kilos : « Paiement reçu » (indépendant des étapes du colis) → réservation mise à jour (paidAt)
  markPaymentReceived: (id, note) => api.post(`/conversations/${id}/payment-received`, { note }),
  markRead: (id) => api.post(`/conversations/${id}/read`, {}, guestOptions(id)),
  changeStatus: (id, status, note) => api.patch(`/conversations/${id}/status`, { status, note }, guestOptions(id)),
};
