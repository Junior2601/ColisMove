import { Router } from "express";
import * as client from "../controllers/client.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { listClientReservationsQuery } from "../validators/client.validator.js";

const router = Router();

router.use(authenticate, authorize("CLIENT"));

// ClientDashboard.jsx
router.get("/reservations", validate({ query: listClientReservationsQuery }), client.listReservations);
router.get("/stats", client.getStats);

export default router;
