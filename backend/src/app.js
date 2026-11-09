import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env, isDev } from "./config/env.js";
import { pool } from "./config/db.js";
import routes from "./routes/index.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";

const app = express();

// En production, Caddy est devant l'API : on lui fait confiance pour l'IP réelle du visiteur (1 proxy)
if (!isDev) app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.corsOrigins, credentials: true }));
// Corps JSON limités à 100 ko, sauf l'envoi d'un billet avec ses pièces jointes :
// cette route lit elle-même son corps (12 Mo), une fois l'admin authentifié (routes/admin.routes.js)
const jsonBody = express.json({ limit: "100kb" });
const LARGE_BODY_ROUTE = /^\/api\/admin\/flight-orders\/\d+\/ticket$/;
app.use((req, res, next) => (req.method === "POST" && LARGE_BODY_ROUTE.test(req.path) ? next() : jsonBody(req, res, next)));
if (isDev) app.use(morgan("dev"));

// Santé : utilisée par Docker et par le déploiement (vérifie aussi la base de données)
app.get("/api/health", async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
