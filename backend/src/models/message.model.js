import { pool } from "../config/db.js";

export function toMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type, // CUSTOMER | OWNER | ADMIN | SYSTEM
    senderId: row.sender_id,
    body: row.body,
    // Photo jointe (le fichier se lit à part : GET /conversations/:id/attachments/:attachmentId)
    attachment: row.attachment_id
      ? { id: row.attachment_id, contentType: row.attachment_type, width: row.attachment_width, height: row.attachment_height }
      : null,
    createdAt: row.created_at,
  };
}

// Colonnes de la photo jointe, avec « LEFT JOIN message_attachments a ON a.message_id = m.id »
const ATTACHMENT_COLUMNS = `a.id AS attachment_id, a.content_type AS attachment_type,
  a.width AS attachment_width, a.height AS attachment_height`;

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
    `SELECT m.*, ${ATTACHMENT_COLUMNS}
     FROM messages m
     LEFT JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = $1 AND ($2::bigint IS NULL OR m.id < $2)
     ORDER BY m.id DESC
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

// Message automatique dans la conversation d'une demande de billet d'avion
export async function createSystemForFlightOrder(flightOrderId, body, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO messages (conversation_id, sender_type, body)
     SELECT c.id, 'SYSTEM'::message_sender, $2::text
     FROM conversations c
     WHERE c.flight_order_id = $1
     RETURNING *`,
    [flightOrderId, body]
  );
  return rows.map(toMessage);
}

/* ---------- Photos jointes ---------- */

/** Photo d'un message : { contentType, data (Buffer), width, height } → { id, contentType, width, height } */
export async function addAttachment(messageId, { contentType, data, width = null, height = null }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO message_attachments (message_id, content_type, size_bytes, width, height, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, content_type, width, height`,
    [messageId, contentType, data.length, width, height, data]
  );
  const row = rows[0];
  return { id: row.id, contentType: row.content_type, width: row.width, height: row.height };
}

export async function countAttachments(conversationId, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS count FROM message_attachments a JOIN messages m ON m.id = a.message_id
     WHERE m.conversation_id = $1`,
    [conversationId]
  );
  return rows[0].count;
}

/** Fichier d'une photo, seulement s'il appartient bien à cette conversation */
export async function findAttachment(conversationId, attachmentId, db = pool) {
  const { rows } = await db.query(
    `SELECT a.content_type, a.data FROM message_attachments a JOIN messages m ON m.id = a.message_id
     WHERE a.id = $1 AND m.conversation_id = $2`,
    [attachmentId, conversationId]
  );
  return rows[0] ? { contentType: rows[0].content_type, data: rows[0].data } : null;
}
