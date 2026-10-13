import { pool } from "../config/db.js";

export function toMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type, // CUSTOMER | OWNER | ADMIN | SYSTEM
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function create({ conversationId, senderType, senderId = null, body }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO messages (conversation_id, sender_type, sender_id, body)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [conversationId, senderType, senderId, body]
  );
  return toMessage(rows[0]);
}

/**
 * Une page de messages, du plus ancien au plus récent.
 * `before` = id du plus vieux message déjà affiché (pour remonter l'historique).
 */
export async function listPage(conversationId, { before, limit }, db = pool) {
  const { rows } = await db.query(
    `SELECT * FROM messages
     WHERE conversation_id = $1 AND ($2::bigint IS NULL OR id < $2)
     ORDER BY id DESC
     LIMIT $3`,
    [conversationId, before ?? null, limit + 1] // +1 pour savoir s'il en reste
  );
  return {
    items: rows.slice(0, limit).reverse().map(toMessage),
    hasMore: rows.length > limit,
  };
}

// Message automatique dans la conversation de chacune des réservations données
export async function createSystemForReservations(reservationIds, body, db = pool) {
  if (!reservationIds.length) return [];
  const { rows } = await db.query(
    `INSERT INTO messages (conversation_id, sender_type, body)
     SELECT c.id, 'SYSTEM'::message_sender, $2::text
     FROM conversations c
     WHERE c.reservation_id = ANY($1::int[])
     RETURNING *`,
    [reservationIds, body]
  );
  return rows.map(toMessage);
}
