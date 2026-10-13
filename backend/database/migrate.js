/**
 * Applique database/schema.sql (supprime puis recrée toutes les tables).
 *   npm run db:schema
 */
import { readFile } from "node:fs/promises";
import { env } from "../src/config/env.js";
import { pool } from "../src/config/db.js";

if (env.nodeEnv === "production" && !process.argv.includes("--force")) {
  console.error("❌ Refusé en production : ce script efface toutes les données (ajoutez --force si c'est voulu).");
  process.exit(1);
}

const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");

try {
  await pool.query(sql);
  console.log("✅ Schéma appliqué.");
} catch (err) {
  console.error("❌ Erreur SQL :", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
