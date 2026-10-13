import { api } from "./client";

// Une fonction par route /api/admin/* du backend
export const adminApi = {
  // Tableau de bord
  getStats: () => api.get("/admin/stats"),
  getActorStats: () => api.get("/admin/stats/actors"),

  // Voyages
  listTrips: (params) => api.get("/admin/trips", params),
  createTrip: (data) => api.post("/admin/trips", data),
  updateTrip: (id, data) => api.patch(`/admin/trips/${id}`, data),
  cancelTrip: (id, reason) => api.patch(`/admin/trips/${id}/cancel`, { reason }),

  // Réservations
  listReservations: (params) => api.get("/admin/reservations", params),
  getReservation: (id) => api.get(`/admin/reservations/${id}`),
  updateReservationStatus: (id, status, note) =>
    api.patch(`/admin/reservations/${id}/status`, { status, note }),

  // Voyageurs
  listTravelers: (params) => api.get("/admin/travelers", params),
  updateTravelerStatus: (id, status) => api.patch(`/admin/travelers/${id}/status`, { status }),

  // Campagnes saisonnières et notifications automatiques
  listCampaigns: () => api.get("/admin/campaigns"),
  campaignAudience: (params) => api.get("/admin/campaigns/audience", params), // → { count }
  createCampaign: (data) => api.post("/admin/campaigns", data),
  updateCampaign: (id, data) => api.patch(`/admin/campaigns/${id}`, data),
  cancelCampaign: (id) => api.post(`/admin/campaigns/${id}/cancel`),
  marketingStats: () => api.get("/admin/marketing/stats"),

  // Paramètres
  getSettings: () => api.get("/admin/settings"),
  updateSettings: (data) => api.patch("/admin/settings", data),
};
