import { pool } from "../config/db.js";
import { buildSetClause, exactPattern, likePattern } from "../utils/sql.js";
import { toLocalIso } from "../utils/date.js";

// Colonnes modifiables : clé JS → colonne SQL (liste blanche)
const UPDATABLE_COLUMNS = {
  departureCity: "departure_city",
  departureAt: "departure_at",
  stopCity: "stop_city",
  stopDuration: "stop_duration",
  arrivalCity: "arrival_city",
  arrivalAt: "arrival_at",
  kilosTotal: "kilos_total",
  pricePerKilo: "price_per_kilo",
  currency: "currency",
};

const HAS_DEPARTED = "(departure_at < LOCALTIMESTAMP) AS has_departed";
const round2 = (n) => Math.round(n * 100) / 100;

export function toTrip(row) {
  if (!row) return null;
  const trip = {
    id: row.id,
    ownerId: row.owner_id,
    departureCity: row.departure_city,
    departureAt: toLocalIso(row.departure_at),
    stopCity: row.stop_city,
    stopDuration: row.stop_duration,
    arrivalCity: row.arrival_city,
    arrivalAt: toLocalIso(row.arrival_at),
    kilosTotal: row.kilos_total,
    kilosReserved: row.kilos_reserved,
    kilosAvailable: round2(row.kilos_total - row.kilos_reserved),
    pricePerKilo: row.price_per_kilo,
    currency: row.currency,
    status: row.status,
    hasDeparted: row.has_departed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  // Présents seulement dans les requêtes avec jointure
  if (row.owner_role !== undefined) {
    trip.owner = {
      id: row.owner_id,
      firstName: row.owner_first_name,
      lastName: row.owner_last_name,
      role: row.owner_role,
    };
  }
  if (row.reservations_count !== undefined) {
    trip.reservationsCount = row.reservations_count;
    trip.pendingReservationsCount = row.pending_reservations_count;
    trip.revenue = row.revenue; // montant des réservations non annulées, dans la devise du voyage
  }
  return trip;
}

/**
 * Liste paginée de voyages avec propriétaire + compteurs de réservations.
 * Tri : voyages à venir d'abord (le plus proche en premier), puis les passés (le plus récent en premier).
 */
export async function list({ q, ownerId, ownerRole, status, period, limit, offset }, db = pool) {
  const { rows } = await db.query(
    `SELECT t.*,
            (t.departure_at < LOCALTIMESTAMP) AS has_departed,
            u.first_name AS owner_first_name, u.last_name AS owner_last_name, u.role AS owner_role,
            COUNT(r.id) FILTER (WHERE r.status <> 'CANCELLED') AS reservations_count,
            COUNT(r.id) FILTER (WHERE r.status = 'PENDING')    AS pending_reservations_count,
            COALESCE(SUM(r.total_amount) FILTER (WHERE r.status <> 'CANCELLED'), 0) AS revenue,
            COUNT(*) OVER () AS total_count
     FROM trips t
     JOIN users u ON u.id = t.owner_id
     LEFT JOIN reservations r ON r.trip_id = t.id
     WHERE ($1::text IS NULL OR t.departure_city ILIKE $1 OR t.arrival_city ILIKE $1 OR t.stop_city ILIKE $1)
       AND ($2::int IS NULL OR t.owner_id = $2)
       AND ($3::user_role IS NULL OR u.role = $3)
       AND ($4::trip_status IS NULL OR t.status = $4)
       AND ($5::text IS NULL
            OR ($5::text = 'upcoming' AND t.departure_at >= LOCALTIMESTAMP)
            OR ($5::text = 'past'     AND t.departure_at <  LOCALTIMESTAMP))
     GROUP BY t.id, u.id
     ORDER BY (t.departure_at < LOCALTIMESTAMP),
              CASE WHEN t.departure_at >= LOCALTIMESTAMP THEN t.departure_at END ASC,
              t.departure_at DESC
     LIMIT $6 OFFSET $7`,
    [likePattern(q), ownerId ?? null, ownerRole ?? null, status ?? null, period ?? null, limit, offset]
  );
  return { items: rows.map(toTrip), total: rows[0]?.total_count ?? 0 };
}

export async function findById(id, db = pool) {
  const { rows } = await db.query(`SELECT *, ${HAS_DEPARTED} FROM trips WHERE id = $1`, [id]);
  return toTrip(rows[0]);
}

// Verrouille la ligne jusqu'à la fin de la transaction (évite deux modifications simultanées)
export async function findByIdForUpdate(id, db) {
  const { rows } = await db.query(`SELECT *, ${HAS_DEPARTED} FROM trips WHERE id = $1 FOR UPDATE`, [id]);
  return toTrip(rows[0]);
}

export async function create(trip, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO trips (owner_id, departure_city, departure_at, stop_city, stop_duration,
                        arrival_city, arrival_at, kilos_total, price_per_kilo, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *, ${HAS_DEPARTED}`,
    [
      trip.ownerId, trip.departureCity, trip.departureAt, trip.stopCity ?? null, trip.stopDuration ?? null,
      trip.arrivalCity, trip.arrivalAt, trip.kilosTotal, trip.pricePerKilo, trip.currency,
    ]
  );
  return toTrip(rows[0]);
}

export async function update(id, fields, db = pool) {
  const { sql, values } = buildSetClause(fields, UPDATABLE_COLUMNS);
  if (!sql) return findById(id, db);
  values.push(id);
  const { rows } = await db.query(
    `UPDATE trips SET ${sql} WHERE id = $${values.length} RETURNING *, ${HAS_DEPARTED}`,
    values
  );
  return toTrip(rows[0]);
}

// Annulation : plus aucun kilo réservé (les réservations actives sont annulées par le service)
export async function markCancelled(id, db = pool) {
  const { rows } = await db.query(
    `UPDATE trips SET status = 'CANCELLED', kilos_reserved = 0 WHERE id = $1 RETURNING *, ${HAS_DEPARTED}`,
    [id]
  );
  return toTrip(rows[0]);
}

// delta > 0 : réserver des kilos ; delta < 0 : libérer des kilos (annulation)
export async function addReservedKilos(id, delta, db = pool) {
  await db.query(`UPDATE trips SET kilos_reserved = kilos_reserved + $2 WHERE id = $1`, [id, delta]);
}

/* ===================== Voyages publics (visiteurs et clients) ===================== */

// Le nom du propriétaire est réduit à son initiale ("Serge B.") : pas de nom complet en public
const PUBLIC_SELECT = `
  SELECT t.*, (t.departure_at < LOCALTIMESTAMP) AS has_departed,
         u.first_name AS owner_first_name, LEFT(u.last_name, 1) AS owner_last_name, u.role AS owner_role
  FROM trips t
  JOIN users u ON u.id = t.owner_id`;

/**
 * Voyages réservables : publiés, pas encore partis, avec des kilos restants,
 * et dont le propriétaire est approuvé (un voyageur révoqué disparaît de la liste).
 */
export async function listPublic({ q, from, to, city, direct = false, week = false, limit, offset }, db = pool) {
  const { rows } = await db.query(
    `${PUBLIC_SELECT.replace("SELECT t.*,", "SELECT COUNT(*) OVER () AS total_count, t.*,")}
     WHERE t.status = 'PUBLISHED' AND u.status = 'APPROVED'
       AND t.departure_at > LOCALTIMESTAMP
       AND t.kilos_reserved < t.kilos_total
       AND ($1::text IS NULL OR t.departure_city ILIKE $1 OR t.arrival_city ILIKE $1 OR t.stop_city ILIKE $1)
       AND ($2::text IS NULL OR t.departure_city ILIKE $2)
       AND ($3::text IS NULL OR t.arrival_city ILIKE $3)
       AND ($4::text IS NULL OR t.departure_city ILIKE $4 OR t.arrival_city ILIKE $4)
       AND (NOT $5::boolean OR t.stop_city IS NULL)
       AND (NOT $6::boolean OR t.departure_at < LOCALTIMESTAMP + INTERVAL '7 days')
     ORDER BY t.departure_at ASC
     LIMIT $7 OFFSET $8`,
    [likePattern(q), likePattern(from), likePattern(to), exactPattern(city), Boolean(direct), Boolean(week), limit, offset]
  );
  return { items: rows.map(toTrip), total: rows[0]?.total_count ?? 0 };
}

// Détail public : les voyages annulés ou d'un propriétaire non approuvé n'existent pas pour le public
export async function findPublicById(id, db = pool) {
  const { rows } = await db.query(
    `${PUBLIC_SELECT}
     WHERE t.id = $1 AND t.status IN ('PUBLISHED', 'COMPLETED') AND u.status = 'APPROVED'`,
    [id]
  );
  return toTrip(rows[0]);
}

// Verrouille le voyage pendant une réservation (deux clients ne peuvent pas prendre les mêmes kilos)
export async function findForBooking(id, db) {
  const { rows } = await db.query(
    `SELECT t.*, (t.departure_at < LOCALTIMESTAMP) AS has_departed, u.status AS owner_status
     FROM trips t JOIN users u ON u.id = t.owner_id
     WHERE t.id = $1
     FOR UPDATE OF t`,
    [id]
  );
  return rows[0] ? { ...toTrip(rows[0]), ownerStatus: rows[0].owner_status } : null;
}

/* ===================== Espace voyageur ===================== */

// Compteurs des onglets "À venir" / "Terminés" d'un propriétaire
export async function countByOwnerPeriods(ownerId, db = pool) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE departure_at >= LOCALTIMESTAMP) AS upcoming,
       COUNT(*) FILTER (WHERE departure_at <  LOCALTIMESTAMP) AS past
     FROM trips WHERE owner_id = $1`,
    [ownerId]
  );
  return rows[0];
}

export async function deleteById(id, db = pool) {
  await db.query(`DELETE FROM trips WHERE id = $1`, [id]);
}
