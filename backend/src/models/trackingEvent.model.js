import { pool } from "../config/db.js";

export function toTrackingEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    reservationId: row.reservation_id,
    status: row.status,
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.first_name ? `${row.first_name} ${row.last_name}` : null,
    createdAt: row.created_at,
  };
}

export async function create({ reservationId, status, note = null, createdBy = null }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO tracking_events (reservation_id, status, note, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [reservationId, status, note, createdBy]
  );
  return toTrackingEvent(rows[0]);
}

// Un même événement pour plusieurs réservations (ex. annulation d'un voyage entier)
export async function createMany(reservationIds, { status, note = null, createdBy = null }, db = pool) {
  if (!reservationIds.length) return;
  await db.query(
    `INSERT INTO tracking_events (reservation_id, status, note, created_by)
     SELECT id, $2::reservation_status, $3::varchar, $4::int FROM unnest($1::int[]) AS id`,
    [reservationIds, status, note, createdBy]
  );
}

export async function listByReservation(reservationId, db = pool) {
  const { rows } = await db.query(
    `SELECT e.*, u.first_name, u.last_name
     FROM tracking_events e
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.reservation_id = $1
     ORDER BY e.created_at, e.id`,
    [reservationId]
  );
  return rows.map(toTrackingEvent);
}
