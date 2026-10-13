import { Router } from "express";
import * as conversation from "../controllers/conversation.controller.js";
import { optionalAuth, requireActor, requireUser } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import {
  changeStatusBody,
  listConversationsQuery,
  messagesQuery,
  sendMessageBody,
} from "../validators/conversation.validator.js";

const router = Router();

router.use(optionalAuth);

// Boîte de réception : comptes uniquement (les visiteurs retrouvent leurs conversations sur leur appareil)
router.get("/", requireUser, validate({ query: listConversationsQuery }), conversation.list);
router.get("/unread-count", requireUser, conversation.unreadCount);

// Une conversation : compte participant, admin, ou visiteur avec l'en-tête X-Guest-Token
router.get("/:id", requireActor, validate({ params: idParam }), conversation.getOne);
router.get("/:id/messages", requireActor, validate({ params: idParam, query: messagesQuery }), conversation.listMessages);
router.post("/:id/messages", requireActor, validate({ params: idParam, body: sendMessageBody }), conversation.sendMessage);
router.post("/:id/read", requireActor, validate({ params: idParam }), conversation.markRead);
router.patch("/:id/status", requireActor, validate({ params: idParam, body: changeStatusBody }), conversation.changeStatus);

export default router;
