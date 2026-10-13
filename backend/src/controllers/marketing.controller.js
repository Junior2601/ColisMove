import * as marketingService from "../services/marketing.service.js";

/* ---------- Utilisateur connecté : préférences, trajets favoris, accueil ---------- */

export async function getMine(req, res) {
  res.json(await marketingService.getMyMarketing(req.user));
}

export async function updatePreferences(req, res) {
  res.json(await marketingService.updatePreferences(req.user, req.valid.body));
}

export async function addFavorite(req, res) {
  res.status(201).json(await marketingService.addFavorite(req.user, req.valid.body));
}

export async function removeFavorite(req, res) {
  res.json(await marketingService.removeFavorite(req.user, req.valid.params.id));
}

export async function completeOnboarding(req, res) {
  res.json(await marketingService.completeOnboarding(req.user, req.valid.body));
}

/* ---------- Admin : campagnes et statistiques ---------- */

export async function listCampaigns(req, res) {
  res.json(await marketingService.listCampaigns());
}

export async function createCampaign(req, res) {
  res.status(201).json(await marketingService.createCampaign(req.user, req.valid.body));
}

export async function updateCampaign(req, res) {
  res.json(await marketingService.updateCampaign(req.valid.params.id, req.valid.body));
}

export async function cancelCampaign(req, res) {
  res.json(await marketingService.cancelCampaign(req.valid.params.id));
}

export async function audience(req, res) {
  res.json(await marketingService.countAudience(req.valid.query));
}

export async function stats(req, res) {
  res.json(await marketingService.marketingStats());
}
