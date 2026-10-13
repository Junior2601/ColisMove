import { api } from "./client";

// Fuseau de l'appareil (ex. "Africa/Abidjan", "Europe/Moscow") : pas de notification la nuit
export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Préférences de notifications automatiques et trajets favoris (compte connecté)
export const marketingApi = {
  get: () => api.get("/me/marketing"), // { routeAlerts, campaigns, onboardingCompleted, favorites }
  completeOnboarding: (data) => api.post("/me/marketing/onboarding", { ...data, timezone: deviceTimezone() }),
  updatePreferences: (data) => api.patch("/me/marketing/preferences", { ...data, timezone: deviceTimezone() }),
  addFavorite: (data) => api.post("/me/marketing/favorites", data),
  removeFavorite: (id) => api.delete(`/me/marketing/favorites/${id}`),
};
