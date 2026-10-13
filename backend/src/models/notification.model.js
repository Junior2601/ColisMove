import { pool } from "../config/db.js";

export function toNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    groupKey: row.group_key,
    eventCount: row.event_count,
    read: row.read_at !== null,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Crée la notification, ou met à jour la notification NON LUE du même groupe :
 * 3 messages d'affilée dans une conversation = 1 notification (compteur à 3), remontée en tête.
 */
export async function upsert({ userId, type, title, body, link = null, groupKey = null }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, type, title, body, link, group_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, group_key) WHERE read_at IS NULL AND group_key IS NOT NULL
     DO UPDATE SET type = EXCLUDED.type,
                   title = EXCLUDED.title,
                   body = EXCLUDED.body,
                   link = EXCLUDED.link,
                   event_count = notifications.event_count + 1,
                   created_at = NOW()
     RETURNING *`,
    [userId, type, title, body, link, groupKey]
  );
  return toNotification(rows[0]);
}

export async function listForUser(userId, { limit, offset }, db = pool) {
  const { rows } = await db.query(
    `SELECT *, COUNT(*) OVER () AS total_count
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { items: rows.map(toNotification), total: rows[0]?.total_count ?? 0 };
}

export async function countUnread(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rows[0].count;
}

// Renvoie true si une notification a effectivement changé d'état
export async function markRead(id, userId, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, userId]
  );
  return rowCount > 0;
}

export async function markAllRead(userId, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rowCount;
}

// Ex. la personne ouvre la conversation 12 → ses notifications "conversation:12" sont lues
export async function markGroupRead(userId, groupKey, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND group_key = $2 AND read_at IS NULL`,
    [userId, groupKey]
  );
  return rowCount;
}
