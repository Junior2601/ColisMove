import { api } from "./client";

// Centre de notifications (comptes uniquement)
export const notificationsApi = {
  list: (params) => api.get("/notifications", params),
  counts: () => api.get("/notifications/counts"), // { notifications, messages }
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post("/notifications/read-all"),
};

// Notifications push : abonnement de cet appareil
export const pushApi = {
  config: () => api.get("/push/public-key"), // { enabled, publicKey }
  subscribe: (subscription) => api.post("/push/subscriptions", subscription),
  unsubscribe: (endpoint) => api.post("/push/unsubscribe", { endpoint }),
};
