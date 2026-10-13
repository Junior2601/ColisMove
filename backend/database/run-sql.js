/**
 * Exécute un fichier SQL sur la base du .env (migrations sans perte de données).
 *   npm run db:sql -- database/migrations/002_notifications.sql
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../src/config/db.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage : npm run db:sql -- <chemin/du/fichier.sql>");
  process.exit(1);
}

try {
  await pool.query(await readFile(resolve(file), "utf8"));
  console.log(`✅ ${file} exécuté.`);
} catch (err) {
  console.error("❌ Erreur SQL :", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
