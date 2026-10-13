import { pool } from "../config/db.js";
import { MARKETING } from "../config/constants.js";
import * as marketingModel from "../models/marketing.model.js";
import * as marketingService from "../services/marketing.service.js";
import * as resetModel from "../models/passwordReset.model.js";

/**
 * Planificateur des notifications automatiques. À chaque passage (toutes les 5 min) :
 *  1. lance les campagnes programmées arrivées à échéance
 *  2. une fois par jour : rappels « départ dans 3 jours », sélection de la semaine, purge des vieilles données
 *  3. distribue la file d'envoi (préférences, heures calmes, plafonds)
 *
 * Un verrou PostgreSQL garantit qu'un seul serveur travaille à la fois (si vous en lancez plusieurs).
 */
const LOCK_ID = 74_210_001; // identifiant arbitraire du verrou "marketing"
let timer = null;
let soonTimer = null;
let running = false;

async function withLock(work) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_ID]);
    if (!rows[0].locked) return; // un autre serveur s'en occupe
    try {
      await work();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

async function runDailyJobs() {
  if (new Date().getUTCHours() < MARKETING.dailyJobsHourUtc) return;
  if (!(await marketingModel.claimDailyRun("marketing-daily"))) return; // déjà fait aujourd'hui

  const reminders = await marketingService.enqueueDepartureReminders();
  const digests = await marketingService.enqueueWeeklyDigests();
  const purged = await marketingModel.purgeOldData(MARKETING.purge);
  purged.resets = await resetModel.purgeOld(); // liens de mot de passe oublié de plus de 7 jours
  console.log(
    `🗓️  Tâches du jour : ${reminders} rappel(s) de départ, ${digests} sélection(s) de la semaine, ` +
      `purge (${purged.interests} intérêts, ${purged.queue} envois, ${purged.notifications} notifications, ${purged.resets} liens).`
  );
}

export async function runTick() {
  if (running) return; // le passage précédent n'est pas terminé
  running = true;
  try {
    await withLock(async () => {
      await marketingService.sendDueCampaigns();
      await runDailyJobs();
      await marketingService.deliverDue();
    });
  } catch (err) {
    console.error("[planificateur]", err);
  } finally {
    running = false;
  }
}

// Passage anticipé (ex. campagne "envoyer maintenant", accueil d'un client)
function scheduleSoon(delayMs = 2000) {
  clearTimeout(soonTimer);
  soonTimer = setTimeout(runTick, delayMs);
}

export function startScheduler() {
  if (process.env.MARKETING_ENABLED === "false") {
    console.log("⏸️  Notifications automatiques désactivées (MARKETING_ENABLED=false).");
    return;
  }
  marketingService.registerTickTrigger(scheduleSoon);
  timer = setInterval(runTick, MARKETING.tickMinutes * 60000);
  scheduleSoon(10000); // premier passage peu après le démarrage
  console.log(`⏱️  Notifications automatiques : passage toutes les ${MARKETING.tickMinutes} min.`);
}

export function stopScheduler() {
  clearInterval(timer);
  clearTimeout(soonTimer);
}
