import * as reservationModel from "../models/reservation.model.js";
import { RESERVATION_GROUPS } from "../config/constants.js";

/** Envois du client par onglet : current (en cours), delivered (livrés), cancelled (annulés) */
export async function listReservations(clientId, { group, limit, offset }) {
  const result = await reservationModel.listForClient(clientId, {
    statuses: RESERVATION_GROUPS[group],
    limit,
    offset,
  });
  return { ...result, limit, offset };
}

/** Cartes de statistiques + compteurs des onglets */
export async function getStats(clientId) {
  const stats = await reservationModel.getClientStats(clientId);
  return {
    total: stats.total,
    current: stats.current,
    kilos: stats.kilos,
    spent: stats.spent, // [{ currency, amount }] : une ligne par devise
    groups: { current: stats.current, delivered: stats.delivered, cancelled: stats.cancelled },
  };
}
