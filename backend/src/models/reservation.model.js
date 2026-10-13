import { pool } from "../config/db.js";
import { likePattern } from "../utils/sql.js";
import { toLocalIso } from "../utils/date.js";

// Réservation + voyage + propriétaire du voyage + id de conversation
const SELECT_COLUMNS = `
  r.*,
  t.departure_city, t.arrival_city, t.stop_city, t.departure_at, t.arrival_at, t.owner_id, t.status AS trip_status,
  o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.role AS owner_role,
  c.id AS conversation_id`;

const FROM_JOINS = `
  FROM reservations r
  JOIN trips t ON t.id = r.trip_id
  JOIN users o ON o.id = t.owner_id
  LEFT JOIN conversations c ON c.reservation_id = r.id`;

export function toReservation(row) {
  if (!row) return null;
  const reservation = {
    id: row.id,
    trackingCode: row.tracking_code,
    tripId: row.trip_id,
    clientId: row.client_id,
    isGuest: row.client_id === null, // réservé par un visiteur (sans compte)
    clientName: row.client_name,
    clientPhone: row.client_phone,
    parcelDescription: row.parcel_description,
    kilos: row.kilos,
    pricePerKilo: row.price_per_kilo,
    totalAmount: row.total_amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.departure_city !== undefined) {
    reservation.trip = {
      id: row.trip_id,
      departureCity: row.departure_city,
      arrivalCity: row.arrival_city,
      stopCity: row.stop_city,
      departureAt: toLocalIso(row.departure_at),
      arrivalAt: toLocalIso(row.arrival_at),
      status: row.trip_status,
      owner: {
        id: row.owner_id,
        firstName: row.owner_first_name,
        lastName: row.owner_last_name,
        role: row.owner_role,
      },
    };
    reservation.conversationId = row.conversation_id;
  }
  if (row.unread_count !== undefined) reservation.unreadCount = row.unread_count;
  return reservation;
}

/**
 * Création. Le prix, le total et la devise sont lus sur le voyage par PostgreSQL :
 * le client ne peut pas les falsifier. Renvoie l'id, ou null si le code de suivi existe déjà.
 * (Casts explicites : dans un INSERT … SELECT, PostgreSQL ne devine pas le type des paramètres.)
 */
export async function create({ trackingCode, tripId, clientId, clientName, clientPhone, parcelDescription, kilos }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO reservations (tracking_code, trip_id, client_id, client_name, client_phone,
                               parcel_description, kilos, price_per_kilo, total_amount, currency)
     SELECT $1::varchar, t.id, $3::int, $4::varchar, $5::varchar, $6::text, $7::numeric,
            t.price_per_kilo, ROUND($7::numeric * t.price_per_kilo, 2), t.currency
     FROM trips t
     WHERE t.id = $2::int
     ON CONFLICT (tracking_code) DO NOTHING
     RETURNING id`,
    [trackingCode, tripId, clientId ?? null, clientName, clientPhone, parcelDescription ?? null, kilos]
  );
  return rows[0]?.id ?? null;
}

/**
 * Filtres tous optionnels :
 *  - tripId    : réservations d'un voyage
 *  - status    : tableau de statuts, ex. ["RECEIVED", "IN_TRANSIT"]
 *  - ownerId   : réservations des voyages d'un propriétaire (module voyageur)
 *  - q         : recherche sur le code de suivi ou le nom du client
 */
export async function list({ tripId, status, ownerId, q, limit, offset, withOwnerUnread = false }, db = pool) {
  // Espace voyageur : nombre de messages non lus du propriétaire dans chaque conversation
  const unreadColumn = withOwnerUnread
    ? `, (SELECT COUNT(*) FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_type <> 'OWNER'
            AND m.created_at > COALESCE(c.owner_last_read_at, '-infinity')) AS unread_count`
    : "";
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS}${unreadColumn}, COUNT(*) OVER () AS total_count
     ${FROM_JOINS}
     WHERE ($1::int IS NULL OR r.trip_id = $1)
       AND ($2::reservation_status[] IS NULL OR r.status = ANY($2::reservation_status[]))
       AND ($3::int IS NULL OR t.owner_id = $3)
       AND ($4::text IS NULL OR r.tracking_code ILIKE $4 OR r.client_name ILIKE $4)
     ORDER BY r.created_at DESC
     LIMIT $5 OFFSET $6`,
    [tripId ?? null, status ?? null, ownerId ?? null, likePattern(q), limit, offset]
  );
  return { items: rows.map(toReservation), total: rows[0]?.total_count ?? 0 };
}

// Réservations d'un client + nombre de messages non lus dans chaque conversation
export async function listForClient(clientId, { statuses, limit, offset }, db = pool) {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS},
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.id
                AND m.sender_type <> 'CUSTOMER'
                AND m.created_at > COALESCE(c.customer_last_read_at, '-infinity')) AS unread_count,
            COUNT(*) OVER () AS total_count
     ${FROM_JOINS}
     WHERE r.client_id = $1 AND r.status = ANY($2::reservation_status[])
     ORDER BY r.created_at DESC
     LIMIT $3 OFFSET $4`,
    [clientId, statuses, limit, offset]
  );
  return { items: rows.map(toReservation), total: rows[0]?.total_count ?? 0 };
}

export async function getClientStats(clientId, db = pool) {
  const [{ rows: [counts] }, { rows: spent }] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status <> 'CANCELLED')                                        AS total,
         COUNT(*) FILTER (WHERE status IN ('PENDING','CONFIRMED','RECEIVED','IN_TRANSIT','ARRIVED')) AS current,
         COUNT(*) FILTER (WHERE status = 'DELIVERED')                                         AS delivered,
         COUNT(*) FILTER (WHERE status = 'CANCELLED')                                         AS cancelled,
         COALESCE(SUM(kilos) FILTER (WHERE status <> 'CANCELLED'), 0)                         AS kilos
       FROM reservations WHERE client_id = $1`,
      [clientId]
    ),
    db.query(
      `SELECT currency, SUM(total_amount) AS amount
       FROM reservations WHERE client_id = $1 AND status <> 'CANCELLED'
       GROUP BY currency ORDER BY amount DESC`,
      [clientId]
    ),
  ]);
  return { ...counts, spent: spent.map((r) => ({ currency: r.currency, amount: r.amount })) };
}

export async function findById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${SELECT_COLUMNS} ${FROM_JOINS} WHERE r.id = $1`, [id]);
  return toReservation(rows[0]);
}

export async function findByTrackingCode(code, db = pool) {
  const { rows } = await db.query(`SELECT ${SELECT_COLUMNS} ${FROM_JOINS} WHERE r.tracking_code = $1`, [code]);
  return toReservation(rows[0]);
}

// Verrouille la réservation (pas le voyage) et renvoie aussi le propriétaire du voyage
export async function findByIdForUpdate(id, db) {
  const { rows } = await db.query(
    `SELECT r.*, t.owner_id AS trip_owner_id
     FROM reservations r JOIN trips t ON t.id = r.trip_id
     WHERE r.id = $1
     FOR UPDATE OF r`,
    [id]
  );
  return rows[0] ? { ...toReservation(rows[0]), tripOwnerId: rows[0].trip_owner_id } : null;
}

export async function updateStatus(id, status, db = pool) {
  await db.query(`UPDATE reservations SET status = $2 WHERE id = $1`, [id, status]);
}

export async function countByTripAndStatuses(tripId, statuses, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS count FROM reservations WHERE trip_id = $1 AND status = ANY($2::reservation_status[])`,
    [tripId, statuses]
  );
  return rows[0].count;
}

// Annule d'un coup les réservations d'un voyage ayant l'un des statuts donnés → [{ id, clientId }]
export async function cancelByTripAndStatuses(tripId, statuses, db = pool) {
  const { rows } = await db.query(
    `UPDATE reservations SET status = 'CANCELLED'
     WHERE trip_id = $1 AND status = ANY($2::reservation_status[])
     RETURNING id, client_id`,
    [tripId, statuses]
  );
  return rows.map((row) => ({ id: row.id, clientId: row.client_id }));
}
