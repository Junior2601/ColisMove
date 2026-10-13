import * as conversationService from "../services/conversation.service.js";

// req.actor = { user, guestToken } (voir middleware requireActor)

export async function list(req, res) {
  res.json(await conversationService.listForUser(req.user, req.valid.query));
}

export async function unreadCount(req, res) {
  res.json(await conversationService.countUnread(req.user));
}

export async function getOne(req, res) {
  res.json(await conversationService.getDetail(req.valid.params.id, req.actor));
}

export async function listMessages(req, res) {
  res.json(await conversationService.listMessages(req.valid.params.id, req.actor, req.valid.query));
}

// Secours si Socket.io est indisponible : même service, même diffusion temps réel
export async function sendMessage(req, res) {
  const { body, clientId } = req.valid.body;
  const message = await conversationService.sendMessage(req.valid.params.id, req.actor, body, { clientId });
  res.status(201).json(message);
}

export async function markRead(req, res) {
  res.json(await conversationService.markRead(req.valid.params.id, req.actor));
}

export async function changeStatus(req, res) {
  const { status, note } = req.valid.body;
  res.json(await conversationService.changeReservationStatus(req.valid.params.id, req.actor, status, note));
}
