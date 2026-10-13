import { api } from "./client";

export const authApi = {
  // identifier = email ou numéro de téléphone
  login: (identifier, password) => api.post("/auth/login", { identifier, password }),
  // { role: "CLIENT" | "VOYAGEUR", firstName, lastName, email, phone, city?, password }
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
  // Profil : { firstName?, lastName?, email?, phone?, city? }
  updateMe: (data) => api.patch("/auth/me", data),
  changePassword: (currentPassword, newPassword) =>
    api.patch("/auth/me/password", { currentPassword, newPassword }),
};
