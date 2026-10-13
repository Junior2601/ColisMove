import * as userModel from "../models/user.model.js";
import * as realtime from "../socket/realtime.js";
import * as notificationService from "./notification.service.js";
import { notFound } from "../utils/AppError.js";

/** Liste des voyageurs + compteurs par statut (onglets En attente / Approuvés / Refusés) */
export async function listTravelers(filters) {
  const [result, counts] = await Promise.all([
    userModel.listTravelers(filters),
    userModel.countTravelersByStatus(),
  ]);
  return { ...result, counts, limit: filters.limit, offset: filters.offset };
}

/**
 * Approuver, refuser, révoquer ou ré-approuver un compte voyageur.
 * La révocation est immédiate : le middleware authenticate relit le statut en BD à chaque requête.
 */
export async function updateTravelerStatus(travelerId, status) {
  const traveler = await userModel.findById(travelerId);
  if (!traveler || traveler.role !== "VOYAGEUR") throw notFound("Voyageur introuvable.");
  if (traveler.status === status) return traveler; // rien à faire (double clic, etc.)

  const updated = await userModel.updateStatus(travelerId, status);
  // Révocation : on coupe aussi ses connexions temps réel (le REST est déjà bloqué par authenticate)
  if (status === "REJECTED") realtime.disconnectUser(travelerId);
  // Approbation : il la verra en se connectant (et en push s'il a déjà activé les notifications)
  if (status === "APPROVED") {
    await notificationService.notifySafely([travelerId], {
      type: "TRAVELER_APPROVED",
      title: "Compte voyageur approuvé 🎉",
      body: "Vous pouvez maintenant publier vos voyages et vendre vos kilos sur MoveColis.",
      link: "/publier",
    });
  }
  return updated;
}
