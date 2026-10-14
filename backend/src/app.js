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
app.use(express.json({ limit: "100kb" }));
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
