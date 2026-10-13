import { Router } from "express";
import * as notification from "../controllers/notification.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { pushSubscriptionBody, pushUnsubscribeBody } from "../validators/notification.validator.js";

const router = Router();

// Clé publique VAPID dont le navigateur a besoin pour s'abonner ({ enabled, publicKey })
router.get("/public-key", notification.pushConfig);

// Relie cet appareil au compte connecté
router.post("/subscriptions", authenticate, validate({ body: pushSubscriptionBody }), notification.subscribe);

// Détache l'appareil (déconnexion, désactivation). L'endpoint est secret : le connaître suffit.
router.post("/unsubscribe", validate({ body: pushUnsubscribeBody }), notification.unsubscribe);

export default router;
