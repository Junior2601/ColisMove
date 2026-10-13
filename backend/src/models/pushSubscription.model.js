import { pool } from "../config/db.js";

/**
 * Un abonnement par appareil (endpoint unique). Si un autre compte se connecte
 * sur le même appareil, l'abonnement lui est réattribué.
 */
export async function upsert({ userId, endpoint, p256dh, auth, userAgent = null }, db = pool) {
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [userId, endpoint, p256dh, auth, userAgent]
  );
}

export async function listByUser(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );
  return rows;
}

export async function deleteByEndpoint(endpoint, db = pool) {
  await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

export async function deleteById(id, db = pool) {
  await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [id]);
}

export async function touch(id, db = pool) {
  await db.query(`UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1`, [id]);
}
