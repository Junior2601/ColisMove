import * as authService from "../services/auth.service.js";

export async function login(req, res) {
  res.json(await authService.login(req.valid.body));
}

export async function register(req, res) {
  res.status(201).json(await authService.register(req.valid.body));
}

export async function me(req, res) {
  res.json(await authService.getMe(req.user.id));
}

export async function updateMe(req, res) {
  res.json(await authService.updateMe(req.user.id, req.valid.body));
}

export async function changePassword(req, res) {
  res.json(await authService.changePassword(req.user.id, req.valid.body));
}

/* ---------- Mot de passe oublié ---------- */

// Toujours la même réponse, immédiate : impossible de savoir si le compte existe
export async function forgotPassword(req, res) {
  authService
    .requestPasswordReset(req.valid.body, { ip: req.ip })
    .catch((err) => console.error("[mot de passe oublié]", err));
  res.json({ ok: true });
}

export async function checkResetToken(req, res) {
  res.json(await authService.checkResetToken(req.valid.body));
}

export async function resetPassword(req, res) {
  res.json(await authService.resetPassword(req.valid.body));
}
