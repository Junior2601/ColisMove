import { pool } from "../config/db.js";
import { buildSetClause, likePattern } from "../utils/sql.js";

// Jamais de password_hash dans les colonnes publiques
const COLUMNS = "id, first_name, last_name, email, phone, city, role, status, status_changed_at, created_at";

export function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    role: row.role,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
  };
}

export async function findById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return toUser(rows[0]);
}

// Utilisés uniquement par la connexion (seules fonctions qui lisent password_hash)
export async function findByEmailWithPassword(email, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUMNS}, password_hash FROM users WHERE email = $1`, [email]);
  return rows[0] ? { ...toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
}

export async function findByPhoneWithPassword(phone, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUMNS}, password_hash FROM users WHERE phone = $1`, [phone]);
  return rows[0] ? { ...toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
}

export async function create(
  { firstName, lastName, email, passwordHash, phone, city = null, role, status, termsVersion = null },
  db = pool
) {
  // termsVersion renseignée = CGU acceptées maintenant (preuve conservée : date + version)
  const { rows } = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, phone, city, role, status,
                        terms_accepted_at, terms_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::varchar IS NULL THEN NULL ELSE NOW() END, $9)
     RETURNING ${COLUMNS}`,
    [firstName, lastName, email, passwordHash, phone, city, role, status, termsVersion]
  );
  return toUser(rows[0]);
}

export async function listTravelers({ status, q, limit, offset }, db = pool) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*) FROM trips t WHERE t.owner_id = u.id) AS trips_count,
            COUNT(*) OVER () AS total_count
     FROM users u
     WHERE u.role = 'VOYAGEUR'
       AND ($1::user_status IS NULL OR u.status = $1)
       AND ($2::text IS NULL
            OR u.first_name ILIKE $2 OR u.last_name ILIKE $2 OR u.email ILIKE $2 OR u.city ILIKE $2)
     ORDER BY u.created_at DESC
     LIMIT $3 OFFSET $4`,
    [status ?? null, likePattern(q), limit, offset]
  );
  return {
    items: rows.map((row) => ({ ...toUser(row), tripsCount: row.trips_count })),
    total: rows[0]?.total_count ?? 0,
  };
}

// { PENDING: 2, APPROVED: 5, REJECTED: 1 } → compteurs des onglets "Approbations"
export async function countTravelersByStatus(db = pool) {
  const { rows } = await db.query(
    `SELECT status, COUNT(*) AS count FROM users WHERE role = 'VOYAGEUR' GROUP BY status`
  );
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export async function updateStatus(id, status, db = pool) {
  const { rows } = await db.query(
    `UPDATE users SET status = $2, status_changed_at = NOW() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status]
  );
  return toUser(rows[0]);
}

/* ===================== Profil (page Profil) ===================== */

const PROFILE_COLUMNS = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  city: "city",
};

export async function updateProfile(id, fields, db = pool) {
  const { sql, values } = buildSetClause(fields, PROFILE_COLUMNS);
  if (!sql) return findById(id, db);
  values.push(id);
  const { rows } = await db.query(
    `UPDATE users SET ${sql} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
    values
  );
  return toUser(rows[0]);
}

export async function findPasswordHash(id, db = pool) {
  const { rows } = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [id]);
  return rows[0]?.password_hash ?? null;
}

export async function updatePassword(id, passwordHash, db = pool) {
  await db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
}

// Destinataires des notifications "admin" (nouvelle demande voyageur…)
export async function listAdminIds(db = pool) {
  const { rows } = await db.query(`SELECT id FROM users WHERE role = 'ADMIN' AND status = 'APPROVED'`);
  return rows.map((row) => row.id);
}
