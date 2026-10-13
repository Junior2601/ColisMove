import * as statsModel from "../models/stats.model.js";
import * as userModel from "../models/user.model.js";

// Évolution en % par rapport à la période précédente (null si rien à comparer)
const trendPercent = (current, previous) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

/** Tableau de bord admin : cartes de stats + compteurs "à traiter" + trajets populaires */
export async function getOverview() {
  const [trips, reservations, volume, pending, topRoutes] = await Promise.all([
    statsModel.getTripStats(),
    statsModel.getReservationStats(),
    statsModel.getVolumeByCurrency(),
    statsModel.getPendingCounts(),
    statsModel.getTopRoutes(5),
  ]);

  return {
    trips: {
      active: trips.active,
      createdLast7Days: trips.createdLast7Days,
      total: trips.total,
      cancelled: trips.cancelled,
      fillRatePercent:
        trips.activeKilosTotal > 0 ? Math.round((trips.activeKilosReserved / trips.activeKilosTotal) * 100) : 0,
    },
    reservations: {
      last30Days: reservations.currentCount,
      previous30Days: reservations.previousCount,
      trendPercent: trendPercent(reservations.currentCount, reservations.previousCount),
    },
    kilos: {
      last30Days: reservations.currentKilos,
      previous30Days: reservations.previousKilos,
      trendPercent: trendPercent(reservations.currentKilos, reservations.previousKilos),
    },
    volume: volume.map((v) => ({ ...v, trendPercent: trendPercent(v.last30Days, v.previous30Days) })),
    pending,
    topRoutes,
  };
}

/** Bloc "Acteurs de la plateforme" */
export async function getActorStats() {
  const [actors, travelers] = await Promise.all([
    statsModel.getActorCounts(),
    userModel.countTravelersByStatus(),
  ]);
  return {
    clients: actors.clients,
    newClientsLast30Days: actors.newClientsLast30Days,
    travelers, // { PENDING, APPROVED, REJECTED }
    guestsLast30Days: actors.guestsLast30Days,
  };
}
