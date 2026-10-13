import * as notificationService from "../services/notification.service.js";
import * as pushService from "../services/push.service.js";

/* ---------- Centre de notifications ---------- */

export async function list(req, res) {
  res.json(await notificationService.list(req.user.id, req.valid.query));
}

export async function counts(req, res) {
  res.json(await notificationService.counts(req.user.id));
}

export async function markRead(req, res) {
  res.json(await notificationService.markRead(req.user.id, req.valid.params.id));
}

export async function markAllRead(req, res) {
  res.json(await notificationService.markAllRead(req.user.id));
}

/* ---------- Push (appareils) ---------- */

export function pushConfig(req, res) {
  res.json(pushService.getConfig());
}

export async function subscribe(req, res) {
  res.status(201).json(await pushService.subscribe(req.user.id, req.valid.body, req.get("user-agent")));
}

export async function unsubscribe(req, res) {
  res.json(await pushService.unsubscribe(req.valid.body.endpoint));
}
