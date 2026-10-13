import { pool } from "../config/db.js";

// Voyages : actifs, créés récemment, remplissage des voyages actifs
export async function getTripStats(db = pool) {
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'PUBLISHED' AND departure_at >= LOCALTIMESTAMP)  AS active,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')               AS created_last_7_days,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')                                  AS cancelled,
      COUNT(*)                                                                      AS total,
      COALESCE(SUM(kilos_reserved) FILTER (WHERE status = 'PUBLISHED' AND departure_at >= LOCALTIMESTAMP), 0) AS active_kilos_reserved,
      COALESCE(SUM(kilos_total)    FILTER (WHERE status = 'PUBLISHED' AND departure_at >= LOCALTIMESTAMP), 0) AS active_kilos_total
    FROM trips`);
  const r = rows[0];
  return {
    active: r.active,
    createdLast7Days: r.created_last_7_days,
    cancelled: r.cancelled,
    total: r.total,
    activeKilosReserved: r.active_kilos_reserved,
    activeKilosTotal: r.active_kilos_total,
  };
}

// Réservations et kilos : 30 derniers jours vs les 30 jours d'avant (pour la tendance)
export async function getReservationStats(db = pool) {
  const { rows } = await db.query(`
    SELECT
      COUNT(*)               FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')     AS current_count,
      COUNT(*)               FILTER (WHERE created_at <  NOW() - INTERVAL '30 days')     AS previous_count,
      COALESCE(SUM(kilos)    FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS current_kilos,
      COALESCE(SUM(kilos)    FILTER (WHERE created_at <  NOW() - INTERVAL '30 days'), 0) AS previous_kilos
    FROM reservations
    WHERE status <> 'CANCELLED' AND created_at >= NOW() - INTERVAL '60 days'`);
  const r = rows[0];
  return {
    currentCount: r.current_count,
    previousCount: r.previous_count,
    currentKilos: r.current_kilos,
    previousKilos: r.previous_kilos,
  };
}

// Volume d'affaires PAR DEVISE (on n'additionne pas des XOF et des EUR)
export async function getVolumeByCurrency(db = pool) {
  const { rows } = await db.query(`
    SELECT currency,
      COALESCE(SUM(total_amount) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS current_amount,
      COALESCE(SUM(total_amount) FILTER (WHERE created_at <  NOW() - INTERVAL '30 days'), 0) AS previous_amount
    FROM reservations
    WHERE status <> 'CANCELLED' AND created_at >= NOW() - INTERVAL '60 days'
    GROUP BY currency
    ORDER BY current_amount DESC`);
  return rows.map((r) => ({
    currency: r.currency,
    last30Days: r.current_amount,
    previous30Days: r.previous_amount,
  }));
}

// Compteurs "à traiter" pour les raccourcis du tableau de bord
export async function getPendingCounts(db = pool) {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM reservations WHERE status = 'PENDING')                    AS reservations,
      (SELECT COUNT(*) FROM users WHERE role = 'VOYAGEUR' AND status = 'PENDING')     AS travelers`);
  return rows[0];
}

// Trajets les plus demandés (en kilos) sur 30 jours
export async function getTopRoutes(limit = 5, db = pool) {
  const { rows } = await db.query(
    `SELECT t.departure_city, t.arrival_city,
            COUNT(r.id)              AS reservations,
            COALESCE(SUM(r.kilos), 0) AS kilos
     FROM reservations r
     JOIN trips t ON t.id = r.trip_id
     WHERE r.status <> 'CANCELLED' AND r.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY t.departure_city, t.arrival_city
     ORDER BY kilos DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    departureCity: r.departure_city,
    arrivalCity: r.arrival_city,
    reservations: r.reservations,
    kilos: r.kilos,
  }));
}

export async function getActorCounts(db = pool) {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'CLIENT') AS clients,
      (SELECT COUNT(*) FROM users WHERE role = 'CLIENT' AND created_at >= NOW() - INTERVAL '30 days') AS new_clients,
      -- Les visiteurs n'ont pas de compte : on compte les numéros distincts ayant réservé sans compte
      (SELECT COUNT(DISTINCT client_phone) FROM reservations
        WHERE client_id IS NULL AND created_at >= NOW() - INTERVAL '30 days') AS guests`);
  const r = rows[0];
  return { clients: r.clients, newClientsLast30Days: r.new_clients, guestsLast30Days: r.guests };
}

/* ===================== Espace voyageur (ses voyages uniquement) ===================== */

export async function getOwnerTripStats(ownerId, db = pool) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'CANCELLED')                                                AS published,
       COUNT(*) FILTER (WHERE status <> 'CANCELLED' AND created_at >= date_trunc('month', NOW()))   AS published_this_month,
       COUNT(*) FILTER (WHERE status = 'PUBLISHED' AND departure_at >= LOCALTIMESTAMP)              AS upcoming
     FROM trips WHERE owner_id = $1`,
    [ownerId]
  );
  const r = rows[0];
  return { published: r.published, publishedThisMonth: r.published_this_month, upcoming: r.upcoming };
}

export async function getOwnerReservationStats(ownerId, db = pool) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE r.status <> 'CANCELLED')                                                    AS received,
       COUNT(*) FILTER (WHERE r.status <> 'CANCELLED' AND r.created_at >= date_trunc('month', NOW()))     AS received_this_month,
       COUNT(*) FILTER (WHERE r.status = 'PENDING')                                                       AS pending,
       COALESCE(SUM(r.kilos) FILTER (WHERE r.status <> 'CANCELLED'), 0)                                   AS kilos,
       COALESCE(SUM(r.kilos) FILTER (WHERE r.status <> 'CANCELLED'
                                       AND r.created_at >= date_trunc('month', NOW())), 0)               AS kilos_this_month
     FROM reservations r JOIN trips t ON t.id = r.trip_id
     WHERE t.owner_id = $1`,
    [ownerId]
  );
  const r = rows[0];
  return {
    received: r.received,
    receivedThisMonth: r.received_this_month,
    pending: r.pending,
    kilos: r.kilos,
    kilosThisMonth: r.kilos_this_month,
  };
}

// Revenus estimés (réservations non annulées), une ligne par devise
export async function getOwnerRevenue(ownerId, db = pool) {
  const { rows } = await db.query(
    `SELECT r.currency,
            SUM(r.total_amount) AS amount,
            COALESCE(SUM(r.total_amount) FILTER (WHERE r.created_at >= date_trunc('month', NOW())), 0) AS this_month
     FROM reservations r JOIN trips t ON t.id = r.trip_id
     WHERE t.owner_id = $1 AND r.status <> 'CANCELLED'
     GROUP BY r.currency
     ORDER BY amount DESC`,
    [ownerId]
  );
  return rows.map((r) => ({ currency: r.currency, amount: r.amount, thisMonth: r.this_month }));
}

// Remplissage des prochains voyages (les plus proches d'abord)
export async function getOwnerUpcomingFill(ownerId, limit = 5, db = pool) {
  const { rows } = await db.query(
    `SELECT id, departure_city, arrival_city, departure_at, kilos_total, kilos_reserved
     FROM trips
     WHERE owner_id = $1 AND status = 'PUBLISHED' AND departure_at >= LOCALTIMESTAMP
     ORDER BY departure_at ASC
     LIMIT $2`,
    [ownerId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    departureCity: r.departure_city,
    arrivalCity: r.arrival_city,
    departureAt: String(r.departure_at).replace(" ", "T").slice(0, 16),
    kilosTotal: r.kilos_total,
    kilosReserved: r.kilos_reserved,
  }));
}
