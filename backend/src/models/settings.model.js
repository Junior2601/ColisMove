import { pool } from "../config/db.js";
import { buildSetClause } from "../utils/sql.js";

const UPDATABLE_COLUMNS = {
  supportWhatsapp: "support_whatsapp",
  reservationMessageTemplate: "reservation_message_template",
};

export function toSettings(row) {
  if (!row) return null;
  return {
    supportWhatsapp: row.support_whatsapp,
    reservationMessageTemplate: row.reservation_message_template,
    updatedAt: row.updated_at,
  };
}

export async function get(db = pool) {
  const { rows } = await db.query(`SELECT * FROM settings WHERE id = 1`);
  return toSettings(rows[0]);
}

export async function update(fields, db = pool) {
  const { sql, values } = buildSetClause(fields, UPDATABLE_COLUMNS);
  if (!sql) return get(db);
  const { rows } = await db.query(`UPDATE settings SET ${sql} WHERE id = 1 RETURNING *`, values);
  return toSettings(rows[0]);
}
