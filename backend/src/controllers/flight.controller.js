import * as flightService from "../services/flight.service.js";
import * as flightOrderService from "../services/flightOrder.service.js";
import * as conversationService from "../services/conversation.service.js";

/* ---------- Côté client (accueil, page d'un billet) ---------- */

export async function config(req, res) {
  res.json(await flightService.getPublicConfig());
}

export async function places(req, res) {
  res.json({ items: await flightService.searchCities(req.valid.query.term) });
}

export async function search(req, res) {
  res.json(await flightService.searchOffers(req.valid.query));
}

export async function getOffer(req, res) {
  res.json(await flightService.getPublicOffer(req.valid.params.id));
}

// req.user : client connecté, ou null pour un visiteur
export async function createOrder(req, res) {
  res.status(201).json(await flightOrderService.createOrder(req.valid.body, { user: req.user }));
}

/* ---------- Administration ---------- */

export async function getSettings(req, res) {
  res.json(await flightService.getAdminSettings());
}

export async function updateSettings(req, res) {
  res.json(await flightService.updateSettings(req.valid.body));
}

export async function createOption(req, res) {
  res.status(201).json(await flightService.createOption(req.valid.body));
}

export async function updateOption(req, res) {
  res.json(await flightService.updateOption(req.valid.params.id, req.valid.body));
}

export async function deleteOption(req, res) {
  res.json(await flightService.deleteOption(req.valid.params.id));
}

export async function listOffers(req, res) {
  res.json(await flightService.listAdminOffers(req.valid.query));
}

export async function updateOffer(req, res) {
  res.json(await flightService.updateOffer(req.valid.params.id, req.valid.body, req.user.id));
}

export async function recentSearches(req, res) {
  res.json({ items: await flightService.listRecentSearches() });
}

export async function listOrders(req, res) {
  res.json(await flightOrderService.listOrders(req.valid.query));
}

export async function sendPaymentInfo(req, res) {
  res.json(await conversationService.sendFlightPaymentInfo(req.valid.params.id, req.user));
}

export async function sendTicket(req, res) {
  res.json(await flightOrderService.sendTicket(req.valid.params.id, req.valid.body, { actorId: req.user.id }));
}

export async function listFreedKilos(req, res) {
  res.json(await flightOrderService.listFreedKilos(req.valid.query));
}

export async function getFreedKilos(req, res) {
  res.json(await flightOrderService.getFreedKilos(req.valid.params.id));
}

export async function updateOrderStatus(req, res) {
  const { status, note } = req.valid.body;
  res.json(
    await flightOrderService.updateStatus(req.valid.params.id, status, {
      actorId: req.user.id,
      note,
      cancelledBy: "par l'équipe MoveColis",
    })
  );
}
