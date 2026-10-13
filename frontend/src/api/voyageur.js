import { api } from "./client";

// Espace voyageur (routes /api/voyageur/*) : le serveur filtre toujours sur le voyageur connecté
export const voyageurApi = {
  // Tableau de bord
  getStats: () => api.get("/voyageur/stats"),

  // Mes voyages
  listTrips: (params) => api.get("/voyageur/trips", params), // { period: upcoming|past }
  createTrip: (data) => api.post("/voyageur/trips", data),
  updateTrip: (id, data) => api.patch(`/voyageur/trips/${id}`, data),
  cancelTrip: (id, reason) => api.patch(`/voyageur/trips/${id}/cancel`, { reason }),
  deleteTrip: (id) => api.delete(`/voyageur/trips/${id}`), // → { deleted, trip }

  // Réservations reçues
  listReservations: (params) => api.get("/voyageur/reservations", params),
  getReservation: (id) => api.get(`/voyageur/reservations/${id}`),
  updateReservationStatus: (id, status, note) =>
    api.patch(`/voyageur/reservations/${id}/status`, { status, note }),
};
