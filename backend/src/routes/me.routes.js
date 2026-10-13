import { Router } from "express";
import * as marketing from "../controllers/marketing.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import { favoriteBody, onboardingBody, preferencesBody } from "../validators/marketing.validator.js";

const router = Router();

router.use(authenticate);

// Profil (section « Mes alertes ») et accueil du tableau de bord client
router.get("/marketing", marketing.getMine);
router.patch("/marketing/preferences", validate({ body: preferencesBody }), marketing.updatePreferences);
router.post("/marketing/onboarding", validate({ body: onboardingBody }), marketing.completeOnboarding);
router.post("/marketing/favorites", validate({ body: favoriteBody }), marketing.addFavorite);
router.delete("/marketing/favorites/:id", validate({ params: idParam }), marketing.removeFavorite);

export default router;
