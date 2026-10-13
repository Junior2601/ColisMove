import { api } from "./client";

export const authApi = {
  // identifier = email ou numéro de téléphone
  login: (identifier, password) => api.post("/auth/login", { identifier, password }),
  // { role: "CLIENT" | "VOYAGEUR", firstName, lastName, email, phone, city?, password }
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
  // Profil : { firstName?, lastName?, email?, phone?, city? }
  updateMe: (data) => api.patch("/auth/me", data),
  // → { token } : nouvelle session pour cet appareil (les autres sont déconnectés)
  changePassword: (currentPassword, newPassword) =>
    api.patch("/auth/me/password", { currentPassword, newPassword }),

  // Mot de passe oublié
  forgotPassword: (identifier) => api.post("/auth/forgot-password", { identifier }),
  checkResetToken: (token) => api.post("/auth/reset-password/check", { token }), // → { valid, email masqué }
  resetPassword: (token, password) => api.post("/auth/reset-password", { token, password }),
};
