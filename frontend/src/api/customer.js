import { api } from "./client";

// Espace client (routes /api/client/*)
export const clientApi = {
  listReservations: (params) => api.get("/client/reservations", params), // { group: current|delivered|cancelled }
  getStats: () => api.get("/client/stats"),
};
