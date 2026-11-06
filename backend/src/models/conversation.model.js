import { pool } from "../config/db.js";
import { toLocalIso } from "../utils/date.js";
import * as flightOrderModel from "./flightOrder.model.js";

/*
 * Une conversation porte sur une réservation de kilos (reservation_id) OU sur une demande de billet
 * d'avion (flight_order_id). Pour un billet, le « propriétaire » est l'admin qui traite la demande (agent_id).
 */
const SUBJECT_JOINS = `
  LEFT JOIN reservations r ON r.id = c.reservation_id
  LEFT JOIN trips t ON t.id = r.trip_id
  LEFT JOIN flight_orders f ON f.id = c.flight_order_id`;
const OWNER_ID = "COALESCE(t.owner_id, f.agent_id)";
const CLIENT_ID = "COALESCE(r.client_id, f.client_id)";

export async function create({ reservationId = null, flightOrderId = null, guestTokenHash = null }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO conversations (reservation_id, flight_order_id, guest_token_hash) VALUES ($1, $2, $3) RETURNING id`,
    [reservationId, flightOrderId, guestTokenHash]
  );
  return rows[0].id;
}

// Le strict nécessaire pour décider qui a le droit d'entrer dans la conversation
export async function findAccessInfo(id, db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.reservation_id, c.flight_order_id, c.guest_token_hash,
            ${CLIENT_ID} AS client_id, ${OWNER_ID} AS owner_id
     FROM conversations c
     ${SUBJECT_JOINS}
     WHERE c.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    reservationId: row.reservation_id,
    flightOrderId: row.flight_order_id,
    guestTokenHash: row.guest_token_hash,
    clientId: row.client_id,
    ownerId: row.owner_id,
  };
}

// Admin supprimé : la conversation reste au nom de la marque
const toOwner = (row) =>
  row.owner_id
    ? { id: row.owner_id, firstName: row.owner_first_name, lastName: row.owner_last_name, role: row.owner_role }
    : { id: null, firstName: "MoveColis", lastName: "", role: "ADMIN" };

/**
 * En-tête de la conversation : accusés de lecture, propriétaire et
 *  - kind "RESERVATION" : réservation + voyage
 *  - kind "FLIGHT"      : demande de billet (flightOrder)
 */
export async function findDetail(id, db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.owner_last_read_at, c.customer_last_read_at, c.created_at, c.flight_order_id,
            r.id AS reservation_id, r.tracking_code, r.client_id, r.client_name, r.client_phone,
            r.kilos, r.price_per_kilo, r.total_amount, r.currency, r.status AS reservation_status,
            r.parcel_description,
            t.id AS trip_id, t.departure_city, t.arrival_city, t.stop_city, t.departure_at, t.arrival_at,
            t.status AS trip_status,
            o.id AS owner_id, o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.role AS owner_role
     FROM conversations c
     ${SUBJECT_JOINS}
     LEFT JOIN users o ON o.id = ${OWNER_ID}
     WHERE c.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  const base = {
    id: row.id,
    createdAt: row.created_at,
    ownerLastReadAt: row.owner_last_read_at,
    customerLastReadAt: row.customer_last_read_at,
    owner: toOwner(row),
  };

  if (row.flight_order_id) {
    return { ...base, kind: "FLIGHT", flightOrder: await flightOrderModel.findById(row.flight_order_id, db) };
  }
  return {
    ...base,
    kind: "RESERVATION",
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
  };
}

/*
 * Non-lus d'un utilisateur ($1) :
 *  - comme propriétaire : messages des autres postés après owner_last_read_at
 *  - comme client       : messages des autres postés après customer_last_read_at
 */
const UNREAD_CONDITION = `
  ((${OWNER_ID} = $1 AND m.sender_type <> 'OWNER'
      AND m.created_at > COALESCE(c.owner_last_read_at, '-infinity'))
   OR (${CLIENT_ID} = $1 AND ${OWNER_ID} IS DISTINCT FROM $1 AND m.sender_type <> 'CUSTOMER'
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
            t.departure_city, t.arrival_city, t.departure_at,
            f.id AS flight_order_id, f.reference, f.client_id AS flight_client_id, f.client_name AS flight_client_name,
            f.status AS flight_status, f.origin_city, f.destination_city, f.departure_at AS flight_departure_at,
            ${OWNER_ID} AS owner_id,
            o.first_name AS owner_first_name, o.last_name AS owner_last_name, o.role AS owner_role,
            lm.body AS last_body, lm.sender_type AS last_sender_type, lm.created_at AS last_created_at,
            CASE WHEN ${OWNER_ID} = $1 THEN 'OWNER' WHEN ${CLIENT_ID} = $1 THEN 'CUSTOMER' ELSE 'ADMIN' END AS viewer_side,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND ${UNREAD_CONDITION}) AS unread_count,
            COUNT(*) OVER () AS total_count
     FROM conversations c
     ${SUBJECT_JOINS}
     LEFT JOIN users o ON o.id = ${OWNER_ID}
     LEFT JOIN LATERAL (
       SELECT body, sender_type, created_at FROM messages
       WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
     ) lm ON TRUE
     WHERE ($2::boolean OR ${OWNER_ID} = $1 OR ${CLIENT_ID} = $1)
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
      ...(row.flight_order_id
        ? {
            kind: "FLIGHT",
            flightOrder: {
              id: row.flight_order_id,
              reference: row.reference,
              clientName: row.flight_client_name,
              isGuest: row.flight_client_id === null,
              status: row.flight_status,
              originCity: row.origin_city,
              destinationCity: row.destination_city,
              departureAt: toLocalIso(row.flight_departure_at),
            },
          }
        : {
            kind: "RESERVATION",
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
          }),
      owner: toOwner(row),
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
     ${SUBJECT_JOINS}
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
