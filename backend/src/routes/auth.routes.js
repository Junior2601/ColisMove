import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { forgotPasswordLimiter, loginLimiter, registerLimiter, resetPasswordLimiter } from "../middlewares/rateLimit.js";
import {
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  resetTokenBody,
  updateMeBody,
} from "../validators/auth.validator.js";

const router = Router();

router.post("/register", registerLimiter, validate({ body: registerBody }), authController.register);
router.post("/login", loginLimiter, validate({ body: loginBody }), authController.login);

// Mot de passe oublié (ForgotPassword.jsx, ResetPassword.jsx)
router.post("/forgot-password", forgotPasswordLimiter, validate({ body: forgotPasswordBody }), authController.forgotPassword);
router.post("/reset-password/check", resetPasswordLimiter, validate({ body: resetTokenBody }), authController.checkResetToken);
router.post("/reset-password", resetPasswordLimiter, validate({ body: resetPasswordBody }), authController.resetPassword);

// Profil.jsx (tous les rôles)
router.get("/me", authenticate, authController.me);
router.patch("/me", authenticate, validate({ body: updateMeBody }), authController.updateMe);
router.patch("/me/password", authenticate, validate({ body: changePasswordBody }), authController.changePassword);

export default router;
