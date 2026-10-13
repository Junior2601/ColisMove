import { Router } from "express";
import authRoutes from "./auth.routes.js";
import publicRoutes from "./public.routes.js";
import conversationRoutes from "./conversation.routes.js";
import clientRoutes from "./client.routes.js";
import voyageurRoutes from "./voyageur.routes.js";
import adminRoutes from "./admin.routes.js";
import notificationRoutes from "./notification.routes.js";
import pushRoutes from "./push.routes.js";
import meRoutes from "./me.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/public", publicRoutes);
router.use("/conversations", conversationRoutes);
router.use("/client", clientRoutes);
router.use("/voyageur", voyageurRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationRoutes);
router.use("/push", pushRoutes);
router.use("/me", meRoutes);

export default router;
