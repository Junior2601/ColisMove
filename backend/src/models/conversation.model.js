import { pool } from "../config/db.js";
import { toLocalIso } from "../utils/date.js";

export async function create({ reservationId, guestTokenHash = null }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO conversations (reservation_id, guest_token_hash) VALUES ($1, $2) RETURNING id`,
    [reservationId, guestTokenHash]
  );
  return rows[0].id;
}

// Le strict nécessaire pour décider qui a le droit d'entrer dans la conversation
export async function findAccessInfo(id, db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.reservation_id, c.guest_token_hash, r.client_id, t.owner_id
     FROM conversations c
     JOIN reservations r ON r.id = c.reservation_id
     JOIN trips t ON t.id = r.trip_id
     WHERE c.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    reservationId: row.reservation_id,
    guestTokenHash: row.guest_token_hash,
    clientId: row.client_id,
    ownerId: row.owner_id,
  };
}

// En-tête de la conversation : réservation, voyage, propriétaire, accusés de lecture
export async function findDetail(id, db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.owner_last_read_at, c.customer_last_read_at, c.created_at,
            r.id AS reservation_id, r.tracking_code, r.client_id, r.client_name, r.client_phone,
            r.kilos, r.price_per_kilo, r.total_amount, r.currency, r.status AS reservation_status,
            r.parcel_description,
            t.id AS trip_id, t.departure_city, t.arrival_city, t.stop_city, t.departure_at, t.arrival_at,
            t.status AS trip_status,
            o.id AS owner_id, o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.role AS owner_role
     FROM conversations c
     JOIN reservations r ON r.id = c.reservation_id
     JOIN trips t ON t.id = r.trip_id
     JOIN users o ON o.id = t.owner_id
     WHERE c.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    ownerLastReadAt: row.owner_last_read_at,
    customerLastReadAt: row.customer_last_read_at,
    reservation: {
      id: row.reservation_id,
      trackingCode: row.tracking_code,
      clientId: row.client_id,
      isGuest: row.client_id === null,
      clientName: row.client_name,
      clientPhone: row.client_phone,
      kilos: row.kilos,
      pricePerKilo: row.price_per_kilo,
      totalAmount: row.total_amount,
      currency: row.currency,
      status: row.reservation_status,
      parcelDescription: row.parcel_description,
    },
    trip: {
      id: row.trip_id,
      departureCity: row.departure_city,
      arrivalCity: row.arrival_city,
      stopCity: row.stop_city,
      departureAt: toLocalIso(row.departure_at),
      arrivalAt: toLocalIso(row.arrival_at),
      status: row.trip_status,
    },
    owner: {
      id: row.owner_id,
      firstName: row.owner_first_name,
      lastName: row.owner_last_name,
      role: row.owner_role,
    },
  };
}

/*
 * Non-lus d'un utilisateur ($1) :
 *  - comme propriétaire : messages des autres postés après owner_last_read_at
 *  - comme client       : messages des autres postés après customer_last_read_at
 */
const UNREAD_CONDITION = `
  ((t.owner_id = $1 AND m.sender_type <> 'OWNER'
      AND m.created_at > COALESCE(c.owner_last_read_at, '-infinity'))
   OR (r.client_id = $1 AND t.owner_id <> $1 AND m.sender_type <> 'CUSTOMER'
      AND m.created_at > COALESCE(c.customer_last_read_at, '-infinity')))`;

/**
 * Boîte de réception : conversations où l'utilisateur est propriétaire ou client
 * (toutes si seeAll, pour l'admin), la plus récente en premier, avec le dernier message.
 */
export async function listForUser({ userId, seeAll, limit, offset }, db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.last_message_at,
            r.id AS reservation_id, r.tracking_code, r.client_id, r.client_name, r.kilos,
            r.status AS reservation_status,
            t.departure_city, t.arrival_city, t.departure_at, t.owner_id,
            o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.role AS owner_role,
            lm.body AS last_body, lm.sender_type AS last_sender_type, lm.created_at AS last_created_at,
            CASE WHEN t.owner_id = $1 THEN 'OWNER' WHEN r.client_id = $1 THEN 'CUSTOMER' ELSE 'ADMIN' END AS viewer_side,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND ${UNREAD_CONDITION}) AS unread_count,
            COUNT(*) OVER () AS total_count
     FROM conversations c
     JOIN reservations r ON r.id = c.reservation_id
     JOIN trips t ON t.id = r.trip_id
     JOIN users o ON o.id = t.owner_id
     LEFT JOIN LATERAL (
       SELECT body, sender_type, created_at FROM messages
       WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
     ) lm ON TRUE
     WHERE ($2::boolean OR t.owner_id = $1 OR r.client_id = $1)
     ORDER BY c.last_message_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, seeAll, limit, offset]
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      lastMessageAt: row.last_message_at,
      viewerSide: row.viewer_side,
      unreadCount: row.unread_count,
      reservation: {
        id: row.reservation_id,
        trackingCode: row.tracking_code,
        clientName: row.client_name,
        isGuest: row.client_id === null,
        kilos: row.kilos,
        status: row.reservation_status,
      },
      trip: {
        departureCity: row.departure_city,
        arrivalCity: row.arrival_city,
        departureAt: toLocalIso(row.departure_at),
      },
      owner: {
        id: row.owner_id,
        firstName: row.owner_first_name,
        lastName: row.owner_last_name,
        role: row.owner_role,
      },
      lastMessage: row.last_body
        ? { body: row.last_body, senderType: row.last_sender_type, createdAt: row.last_created_at }
        : null,
    })),
    total: rows[0]?.total_count ?? 0,
  };
}

// Total des messages non lus (badge de l'en-tête)
export async function countUnreadForUser(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS count
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN reservations r ON r.id = c.reservation_id
     JOIN trips t ON t.id = r.trip_id
     WHERE ${UNREAD_CONDITION}`,
    [userId]
  );
  return rows[0].count;
}

// side : "OWNER" ou "CUSTOMER" (nom de colonne choisi dans une liste blanche)
export async function markRead(id, side, db = pool) {
  const column = side === "OWNER" ? "owner_last_read_at" : "customer_last_read_at";
  const { rows } = await db.query(
    `UPDATE conversations SET ${column} = NOW() WHERE id = $1 RETURNING ${column} AS read_at`,
    [id]
  );
  return rows[0]?.read_at ?? null;
}

// reservationId → conversationId (ex. pour notifier les clients d'un voyage annulé)
export async function findIdsByReservationIds(reservationIds, db = pool) {
  if (!reservationIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT id, reservation_id FROM conversations WHERE reservation_id = ANY($1::int[])`,
    [reservationIds]
  );
  return new Map(rows.map((row) => [row.reservation_id, row.id]));
}
