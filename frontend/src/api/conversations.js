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
  markRead: (id) => api.post(`/conversations/${id}/read`, {}, guestOptions(id)),
  changeStatus: (id, status, note) => api.patch(`/conversations/${id}/status`, { status, note }, guestOptions(id)),
};
