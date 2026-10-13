import * as marketingModel from "../models/marketing.model.js";
import * as tripModel from "../models/trip.model.js";
import * as notificationService from "./notification.service.js";
import { MARKETING } from "../config/constants.js";
import { paths } from "../utils/hashid.js";
import { formatLocalDate } from "../utils/date.js";
import { formatKilos, formatMoney } from "../utils/money.js";
import { ownerDisplayName, routeText } from "../utils/names.js";
import { badRequest, forbidden, notFound } from "../utils/AppError.js";

const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

/* =====================================================================
 *  1. Centres d'intérêt (clients connectés)
 * ===================================================================== */

/**
 * Enregistre un signal d'intérêt (recherche, consultation, réservation) sans jamais bloquer la requête.
 * Seuls les clients sont concernés : ce sont eux qui reçoivent les alertes de trajets.
 */
export function recordInterest(user, { departureCity, arrivalCity }, source) {
  if (user?.role !== "CLIENT" || (!departureCity && !arrivalCity)) return;
  marketingModel
    .recordInterest({ userId: user.id, departureCity, arrivalCity, source })
    .catch((err) => console.error("[marketing] intérêt", err.message));
}

/* =====================================================================
 *  2. Préférences et accueil (onboarding)
 * ===================================================================== */

export async function getMyMarketing(user) {
  const [preferences, favorites] = await Promise.all([
    marketingModel.getPreferences(user.id),
    user.role === "CLIENT" ? marketingModel.listFavorites(user.id) : [],
  ]);
  return { ...preferences, favorites };
}

export async function updatePreferences(user, data) {
  await marketingModel.updatePreferences(user.id, data);
  return getMyMarketing(user);
}

export async function addFavorite(user, { departureCity, arrivalCity }) {
  if (user.role !== "CLIENT") throw forbidden("Les trajets favoris sont réservés aux comptes clients.");
  const favorites = await marketingModel.listFavorites(user.id);
  if (favorites.length >= 5) throw badRequest("5 trajets favoris au maximum.");
  await marketingModel.recordInterest({ userId: user.id, departureCity, arrivalCity, source: "FAVORITE" });
  return getMyMarketing(user);
}

export async function removeFavorite(user, id) {
  if (!(await marketingModel.deleteFavorite(user.id, id))) throw notFound("Trajet favori introuvable.");
  return getMyMarketing(user);
}

/**
 * Accueil d'un nouveau client : trajets favoris + préférences.
 * S'il y a déjà des départs cette semaine vers sa destination, il reçoit tout de suite
 * « Des voyageurs partent vers X cette semaine ».
 */
export async function completeOnboarding(user, { favorites, routeAlerts, campaigns, timezone }) {
  if (user.role !== "CLIENT") throw forbidden("L'accueil personnalisé est réservé aux comptes clients.");
  for (const favorite of favorites) {
    await marketingModel.recordInterest({ userId: user.id, ...favorite, source: "FAVORITE" });
  }
  await marketingModel.updatePreferences(user.id, { routeAlerts, campaigns, timezone, completeOnboarding: true });

  let weekTrips = [];
  if (routeAlerts !== false) {
    weekTrips = await marketingModel.findWeeklyDigestForUser(user.id);
    if (weekTrips.length) {
      await marketingModel.enqueue([digestMessage(weekTrips[0], "welcome-digest")]);
      triggerSoon(); // le planificateur l'envoie dans quelques secondes
    }
  }
  return { ...(await getMyMarketing(user)), weekTrips };
}

/* =====================================================================
 *  3. Déclencheurs d'opportunité
 * ===================================================================== */

// Message de la « sélection de la semaine » (aussi utilisé à l'accueil)
function digestMessage({ userId, destination, trips }, dedupeKey) {
  return {
    userId,
    kind: "WEEKLY_DIGEST",
    title: `Des voyageurs partent vers ${destination} cette semaine 🧳`,
    body: `${plural(trips, "voyage")} dans les 7 prochains jours. Réservez vos kilos avant qu'ils ne soient complets.`,
    link: `/?vers=${encodeURIComponent(destination)}`,
    dedupeKey,
    expiresAt: new Date(Date.now() + 3 * 86400000),
  };
}

/**
 * Nouveau voyage publié → alerte aux clients intéressés par ce trajet :
 *  - recherché, favori ou déjà réservé : « Un voyageur part de Moscou vers Abidjan le 20 »
 *  - seulement consulté : « Nouveau voyageur sur Moscou → Abidjan »
 * Envoyée 10 minutes après la publication, si le voyage est toujours réservable.
 */
export async function onTripPublished(tripId) {
  const [trip, users] = await Promise.all([
    tripModel.findPublicById(tripId),
    marketingModel.findInterestedUsersForTrip(tripId, MARKETING.interestRecencyDays),
  ]);
  if (!trip || !users.length) return 0;

  const route = routeText(trip);
  const date = formatLocalDate(trip.departureAt);
  const offer = `${formatKilos(trip.kilosAvailable)} disponibles à ${formatMoney(trip.pricePerKilo, trip.currency)}/kg`;

  return marketingModel.enqueue(
    users.map(({ userId, source }) => ({
      userId,
      kind: "ROUTE_ALERT",
      ...(source === "VIEW"
        ? {
            title: `Nouveau voyageur sur ${route} ✈️`,
            body: `${ownerDisplayName(trip.owner)} part le ${date} · ${offer}.`,
          }
        : {
            title: `Alerte trajet : ${route} ✈️`,
            body: `Un voyageur part de ${trip.departureCity} vers ${trip.arrivalCity} le ${date} · ${offer}.`,
          }),
      link: paths.trip(trip.id),
      dedupeKey: `trip:${trip.id}`,
      tripId: trip.id,
      sendAfter: new Date(Date.now() + MARKETING.routeAlertDelayMinutes * 60000),
    }))
  );
}

/** Version "sans risque" pour la publication d'un voyage : une erreur ici n'empêche jamais la publication */
export function onTripPublishedSafely(tripId) {
  onTripPublished(tripId)
    .then(() => triggerSoon(MARKETING.routeAlertDelayMinutes * 60000 + 5000))
    .catch((err) => console.error("[marketing] alerte trajet", err));
}

/** Départ dans 3 jours, kilos encore disponibles → rappel aux clients intéressés qui n'ont pas réservé */
export async function enqueueDepartureReminders() {
  const tripIds = await marketingModel.findTripsDepartingIn(MARKETING.departureSoonDays);
  let count = 0;
  for (const tripId of tripIds) {
    const [trip, users] = await Promise.all([
      tripModel.findPublicById(tripId),
      marketingModel.findInterestedUsersForTrip(tripId, MARKETING.interestRecencyDays),
    ]);
    if (!trip) continue;
    count += await marketingModel.enqueue(
      users.map(({ userId }) => ({
        userId,
        kind: "DEPARTURE_SOON",
        title: `Il reste ${MARKETING.departureSoonDays} jours pour confier votre colis ⏳`,
        body: `${routeText(trip)} le ${formatLocalDate(trip.departureAt)} · encore ${formatKilos(trip.kilosAvailable)} disponibles.`,
        link: paths.trip(trip.id),
        dedupeKey: `departure-soon:${trip.id}`,
        tripId: trip.id,
      }))
    );
  }
  return count;
}

// Semaine ISO (ex. "2026-W42") : une seule sélection par personne et par semaine
function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** « Des voyageurs partent vers [destination favorite] cette semaine » — une fois par semaine au plus */
export async function enqueueWeeklyDigests() {
  const candidates = await marketingModel.findWeeklyDigestCandidates(); // triés : le plus de voyages d'abord
  const week = isoWeek();
  return marketingModel.enqueue(candidates.map((c) => digestMessage(c, `digest:${week}`)));
}

/* =====================================================================
 *  4. Distribution : préférences, voyage encore réservable, heures calmes, plafonds
 * ===================================================================== */

// Heure locale de la personne (fuseau de son appareil, Abidjan par défaut)
function localHour(timezone) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone || "Africa/Abidjan" }).format(new Date()));
  } catch {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Abidjan" }).format(new Date()));
  }
}

const isQuietHour = (hour) => hour >= MARKETING.quietStartHour || hour < MARKETING.quietEndHour;
const hoursUntilMorning = (hour) => (MARKETING.morningHour - hour + 24) % 24 || 24;

async function deliverOne(item) {
  const allowed = item.kind === "CAMPAIGN" ? item.marketing_campaigns : item.marketing_route_alerts;
  if (item.user_status !== "APPROVED" || !allowed) return marketingModel.markSkipped(item.id, "preferences");
  if (item.expires_at && new Date(item.expires_at) < new Date()) return marketingModel.markSkipped(item.id, "expired");
  if (!item.trip_bookable) return marketingModel.markSkipped(item.id, "trip_unavailable");
  if (item.already_reserved) return marketingModel.markSkipped(item.id, "already_reserved");

  // Heures calmes : on attend le matin, heure locale
  const hour = localHour(item.timezone);
  if (isQuietHour(hour)) {
    return marketingModel.postpone(item.id, new Date(Date.now() + hoursUntilMorning(hour) * 3600000));
  }

  // Plafonds : semaine pleine → abandon ; journée pleine → demain
  const { day, week } = await marketingModel.countRecentSent(item.user_id);
  if (week >= MARKETING.maxPerWeek) return marketingModel.markSkipped(item.id, "weekly_cap");
  if (day >= MARKETING.maxPerDay) return marketingModel.postpone(item.id, new Date(Date.now() + 24 * 3600000));

  const [notification] = await notificationService.notify([item.user_id], {
    type: item.kind,
    title: item.title,
    body: item.body,
    link: item.link,
  });
  await marketingModel.markSent(item.id, notification.id);
}

export async function deliverDue(limit = 300) {
  const items = await marketingModel.fetchDue(limit);
  for (const item of items) {
    try {
      await deliverOne(item);
    } catch (err) {
      console.error(`[marketing] envoi ${item.id}`, err.message);
    }
  }
  return items.length;
}

/* =====================================================================
 *  5. Campagnes saisonnières (admin)
 * ===================================================================== */

export const listCampaigns = () => marketingModel.listCampaigns();
export const countAudience = (filters) => marketingModel.countAudience(filters).then((count) => ({ count }));
export const marketingStats = () => marketingModel.statsByKind();

// Pas de date d'envoi = maintenant
const withSchedule = (data) =>
  data.status === "SCHEDULED" && !data.scheduledAt ? { ...data, scheduledAt: new Date().toISOString() } : data;

export async function createCampaign(user, data) {
  const campaign = await marketingModel.createCampaign(withSchedule(data), user.id);
  if (campaign.status === "SCHEDULED") triggerSoon();
  return campaign;
}

export async function updateCampaign(id, data) {
  const campaign = await marketingModel.updateCampaign(id, withSchedule(data));
  if (!campaign) throw notFound("Campagne introuvable ou déjà envoyée.");
  if (campaign.status === "SCHEDULED") triggerSoon();
  return campaign;
}

export async function cancelCampaign(id) {
  const campaign = await marketingModel.cancelCampaign(id);
  if (!campaign) throw notFound("Campagne introuvable ou déjà envoyée.");
  return campaign;
}

export async function sendDueCampaigns() {
  const campaigns = await marketingModel.claimDueCampaigns();
  for (const campaign of campaigns) {
    const recipients = await marketingModel.enqueueCampaign(campaign.id, MARKETING.campaignValidityHours);
    console.log(`📣 Campagne « ${campaign.title} » : ${recipients} destinataire(s) en file d'envoi.`);
  }
  return campaigns.length;
}

/* =====================================================================
 *  Lien avec le planificateur (évite une dépendance circulaire)
 * ===================================================================== */

let scheduleTick = () => {};
export function registerTickTrigger(fn) {
  scheduleTick = fn;
}
// Demande un passage du planificateur sans attendre le prochain cycle
export function triggerSoon(delayMs = 2000) {
  scheduleTick(delayMs);
}
