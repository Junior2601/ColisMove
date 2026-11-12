import express, { Router } from "express";
import * as conversation from "../controllers/conversation.controller.js";
import { optionalAuth, requireActor, requireUser } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../validators/common.js";
import {
  attachmentParams,
  changeStatusBody,
  listConversationsQuery,
  messagesQuery,
  paymentReceivedBody,
  sendImageQuery,
  sendMessageBody,
} from "../validators/conversation.validator.js";
import { MAX_IMAGE_BYTES } from "../services/conversation.service.js";

const router = Router();

router.use(optionalAuth);

// Boîte de réception : comptes uniquement (les visiteurs retrouvent leurs conversations sur leur appareil)
router.get("/", requireUser, validate({ query: listConversationsQuery }), conversation.list);
router.get("/unread-count", requireUser, conversation.unreadCount);

// Une conversation : compte participant, admin, ou visiteur avec l'en-tête X-Guest-Token
router.get("/:id", requireActor, validate({ params: idParam }), conversation.getOne);
router.get("/:id/messages", requireActor, validate({ params: idParam, query: messagesQuery }), conversation.listMessages);
router.post("/:id/messages", requireActor, validate({ params: idParam, body: sendMessageBody }), conversation.sendMessage);
// Photo (demande de billet : capture du paiement…) : accès vérifié AVANT de lire le fichier, envoyé en corps brut
router.post(
  "/:id/images",
  requireActor,
  validate({ params: idParam, query: sendImageQuery }),
  conversation.checkAccess,
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
  conversation.sendImage
);
router.get("/:id/attachments/:attachmentId", requireActor, validate({ params: attachmentParams }), conversation.getAttachment);
// Paiement (propriétaire du voyage ou équipe) : numéros envoyés au client, puis « Paiement reçu » (kilos)
router.post("/:id/payment-info", requireActor, validate({ params: idParam }), conversation.sendPaymentInfo);
router.post(
  "/:id/payment-received",
  requireActor,
  validate({ params: idParam, body: paymentReceivedBody }),
  conversation.markPaymentReceived
);
router.post("/:id/read", requireActor, validate({ params: idParam }), conversation.markRead);
router.patch("/:id/status", requireActor, validate({ params: idParam, body: changeStatusBody }), conversation.changeStatus);

export default router;
