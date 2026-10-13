import * as clientService from "../services/client.service.js";

export async function listReservations(req, res) {
  res.json(await clientService.listReservations(req.user.id, req.valid.query));
}

export async function getStats(req, res) {
  res.json(await clientService.getStats(req.user.id));
}
