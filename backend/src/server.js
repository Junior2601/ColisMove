import http from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { initSocket } from "./socket/index.js";
import { startScheduler, stopScheduler } from "./jobs/scheduler.js";

// Express et Socket.io partagent le même serveur HTTP (même port)
const server = http.createServer(app);
const io = initSocket(server);

async function start() {
  await pool.query("SELECT 1"); // échoue tout de suite si la BD est injoignable
  server.listen(env.port, () => {
    console.log(`🚀 API MoveColis sur http://localhost:${env.port}/api (+ Socket.io)`);
    startScheduler(); // notifications automatiques (alertes trajets, rappels, campagnes)
  });
}

start().catch((err) => {
  console.error("❌ Démarrage impossible :", err.message);
  process.exit(1);
});

// Arrêt propre (Ctrl+C, redémarrage du serveur)
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopScheduler();
    // io.close() déconnecte les sockets ET ferme le serveur HTTP
    io.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
