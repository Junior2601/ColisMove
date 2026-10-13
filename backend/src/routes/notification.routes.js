import { Router } from "express";
import * as notification from "../controllers/notification.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import { listNotificationsQuery } from "../validators/notification.validator.js";

const router = Router();

// Centre de notifications : comptes uniquement
router.use(authenticate);

router.get("/", validate({ query: listNotificationsQuery }), notification.list);
router.get("/counts", notification.counts); // { notifications, messages }
router.post("/read-all", notification.markAllRead);
router.post("/:id/read", validate({ params: idParam }), notification.markRead);

export default router;
