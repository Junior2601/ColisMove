/**
 * Migrations de production, SANS perte de données :  npm run db:migrate
 *  - base vide      → crée le schéma complet (schema.sql) et marque toutes les migrations comme faites
 *  - base existante → applique, dans l'ordre, les fichiers de database/migrations pas encore appliqués
 * Chaque migration est appliquée dans une transaction et enregistrée dans la table schema_migrations.
 * Lancé automatiquement à chaque déploiement (deploy/deploy.sh).
 */
import { readdir, readFile } from "node:fs/promises";
import { pool } from "../src/config/db.js";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);
const LOCK_ID = 74_210_002; // deux déploiements simultanés ne migrent jamais en même temps

const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(200) PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS initialized");

  if (!rows[0].initialized) {
    // Première mise en ligne : schéma complet (il contient déjà toutes les migrations)
    console.log("🆕 Base vide : création du schéma complet…");
    await client.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    for (const file of files) {
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
    }
    console.log(`✅ Schéma créé (${files.length} migration(s) marquée(s) comme faite(s)).`);
  } else {
    const applied = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const pending = files.filter((file) => !applied.has(file));
    for (const file of pending) {
      const sql = await readFile(new URL(file, MIGRATIONS_DIR), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`✅ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`${file} : ${err.message}`);
      }
    }
    console.log(pending.length ? `✅ ${pending.length} migration(s) appliquée(s).` : "✅ Base déjà à jour.");
  }
} catch (err) {
  console.error("❌ Migration échouée :", err.message);
  process.exitCode = 1;
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
  client.release();
  await pool.end();
}
