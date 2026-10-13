import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { changePasswordBody, loginBody, registerBody, updateMeBody } from "../validators/auth.validator.js";

const router = Router();

router.post("/register", validate({ body: registerBody }), authController.register);
router.post("/login", validate({ body: loginBody }), authController.login);

// Profil.jsx (tous les rôles)
router.get("/me", authenticate, authController.me);
router.patch("/me", authenticate, validate({ body: updateMeBody }), authController.updateMe);
router.patch("/me/password", authenticate, validate({ body: changePasswordBody }), authController.changePassword);

export default router;
