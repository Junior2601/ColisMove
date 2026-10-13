import { pool } from "../config/db.js";

// Une demande récente existe déjà ? (un seul e-mail par minute et par compte)
export async function requestedRecently(userId, seconds, db = pool) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM password_resets WHERE user_id = $1 AND created_at > NOW() - make_interval(secs => $2)`,
    [userId, seconds]
  );
  return rowCount > 0;
}

/** Nouveau lien : les liens précédents non utilisés de ce compte sont supprimés (un seul lien valable) */
export async function create({ userId, tokenHash, ttlMinutes, ip = null }, db = pool) {
  await db.query(`DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  await db.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
    [userId, tokenHash, ttlMinutes, ip]
  );
}

const VALID_SELECT = `
  SELECT pr.id, pr.user_id, u.email, u.first_name
  FROM password_resets pr
  JOIN users u ON u.id = pr.user_id
  WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW()`;

const toReset = (row) =>
  row ? { id: row.id, userId: row.user_id, email: row.email, firstName: row.first_name } : null;

export async function findValid(tokenHash, db = pool) {
  const { rows } = await db.query(VALID_SELECT, [tokenHash]);
  return toReset(rows[0]);
}

// Verrouille le lien pendant la réinitialisation (deux clics simultanés ne l'utilisent pas deux fois)
export async function findValidForUpdate(tokenHash, db) {
  const { rows } = await db.query(`${VALID_SELECT} FOR UPDATE OF pr`, [tokenHash]);
  return toReset(rows[0]);
}

export async function markUsed(id, db = pool) {
  await db.query(`UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [id]);
}

// Ménage quotidien : les liens de plus de 7 jours ne servent plus à rien
export async function purgeOld(db = pool) {
  const { rowCount } = await db.query(`DELETE FROM password_resets WHERE created_at < NOW() - INTERVAL '7 days'`);
  return rowCount;
}
