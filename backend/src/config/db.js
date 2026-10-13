import pg from "pg";
import { env } from "./env.js";

const { Pool, types } = pg;

// --- Conversion des types PostgreSQL → JavaScript ---
// BIGINT (COUNT(*), BIGSERIAL) : chaîne par défaut → nombre (sans risque sous 2^53)
types.setTypeParser(20, (value) => Number(value));
// NUMERIC (kilos, prix, montants) : chaîne par défaut → nombre
types.setTypeParser(1700, (value) => parseFloat(value));
// TIMESTAMP sans fuseau (heures locales des vols) : on garde la chaîne brute
// pour éviter tout décalage horaire ("2026-07-25 08:45:00" reste tel quel)
types.setTypeParser(1114, (value) => value);

export const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

pool.on("error", (err) => console.error("[pg] erreur sur un client inactif :", err.message));

/**
 * Exécute fn(client) dans une transaction.
 * COMMIT si tout passe, ROLLBACK sinon. Les modèles reçoivent `client` en dernier paramètre.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
