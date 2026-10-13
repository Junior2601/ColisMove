import { api } from "./client";

// Routes accessibles sans compte (le token est envoyé s'il existe : réservation par un client connecté)
export const publicApi = {
  listTrips: (params) => api.get("/public/trips", params),
  getTrip: (id) => api.get(`/public/trips/${id}`),
  // → { reservation, conversationId, guestToken? } (guestToken uniquement pour un visiteur)
  createReservation: (data) => api.post("/public/reservations", data),
  getTracking: (code) => api.get(`/public/tracking/${encodeURIComponent(code)}`),
};
