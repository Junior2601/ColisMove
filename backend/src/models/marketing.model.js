import { pool } from "../config/db.js";
import { toLocalIso } from "../utils/date.js";

// Un intérêt récent (recherche, consultation) compte ; un favori ou une réservation passée compte toujours
const RECENT_INTEREST = (days) =>
  `(i.source IN ('FAVORITE', 'RESERVATION') OR i.last_seen_at > NOW() - INTERVAL '${Number(days)} days')`;

/* ===================== Centres d'intérêt ===================== */

/** Ajoute ou renforce un intérêt (hits + 1). Une ville null = n'importe quelle ville. */
export async function recordInterest({ userId, departureCity = null, arrivalCity = null, source }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO route_interests (user_id, departure_city, arrival_city, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, departure_key, arrival_key, source)
     DO UPDATE SET hits = route_interests.hits + 1, last_seen_at = NOW(),
                   departure_city = EXCLUDED.departure_city, arrival_city = EXCLUDED.arrival_city
     RETURNING id, departure_city, arrival_city, source`,
    [userId, departureCity || null, arrivalCity || null, source]
  );
  return rows[0];
}

export async function listFavorites(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, departure_city, arrival_city FROM route_interests
     WHERE user_id = $1 AND source = 'FAVORITE' ORDER BY created_at`,
    [userId]
  );
  return rows.map((r) => ({ id: r.id, departureCity: r.departure_city, arrivalCity: r.arrival_city }));
}

export async function deleteFavorite(userId, id, db = pool) {
  const { rowCount } = await db.query(
    `DELETE FROM route_interests WHERE id = $1 AND user_id = $2 AND source = 'FAVORITE'`,
    [id, userId]
  );
  return rowCount > 0;
}

/* ===================== Préférences ===================== */

export async function getPreferences(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT marketing_route_alerts, marketing_campaigns, timezone, onboarding_completed_at FROM users WHERE id = $1`,
    [userId]
  );
  const r = rows[0];
  return r
    ? {
        routeAlerts: r.marketing_route_alerts,
        campaigns: r.marketing_campaigns,
        timezone: r.timezone,
        onboardingCompleted: r.onboarding_completed_at !== null,
      }
    : null;
}

export async function updatePreferences(userId, { routeAlerts, campaigns, timezone, completeOnboarding = false }, db = pool) {
  await db.query(
    `UPDATE users SET
       marketing_route_alerts = COALESCE($2, marketing_route_alerts),
       marketing_campaigns = COALESCE($3, marketing_campaigns),
       timezone = COALESCE($4, timezone),
       onboarding_completed_at = CASE WHEN $5 THEN COALESCE(onboarding_completed_at, NOW()) ELSE onboarding_completed_at END
     WHERE id = $1`,
    [userId, routeAlerts ?? null, campaigns ?? null, timezone ?? null, completeOnboarding]
  );
}

/* ===================== Ciblage ===================== */

/**
 * Clients intéressés par un voyage (trajet correspondant, compte actif, alertes activées),
 * hors propriétaire et hors clients ayant déjà réservé dessus.
 * Une ligne par client, avec la source la plus "forte" (favori > recherche > réservation > consultation).
 */
export async function findInterestedUsersForTrip(tripId, recencyDays, db = pool) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (i.user_id) i.user_id, i.source
     FROM trips t
     JOIN route_interests i
       ON (i.departure_key = '' OR i.departure_key = t.departure_key)
      AND (i.arrival_key = '' OR i.arrival_key = t.arrival_key)
     JOIN users u ON u.id = i.user_id
     WHERE t.id = $1
       AND u.role = 'CLIENT' AND u.status = 'APPROVED' AND u.marketing_route_alerts
       AND i.user_id <> t.owner_id
       AND ${RECENT_INTEREST(recencyDays)}
       AND NOT EXISTS (
         SELECT 1 FROM reservations r
         WHERE r.trip_id = t.id AND r.client_id = i.user_id AND r.status <> 'CANCELLED'
       )
     ORDER BY i.user_id, array_position(ARRAY['FAVORITE', 'SEARCH', 'RESERVATION', 'VIEW']::interest_source[], i.source)`,
    [tripId]
  );
  return rows.map((r) => ({ userId: r.user_id, source: r.source }));
}

// Voyages réservables qui partent dans exactement `days` jours (date locale de départ)
export async function findTripsDepartingIn(days, db = pool) {
  const { rows } = await db.query(
    `SELECT t.id FROM trips t JOIN users o ON o.id = t.owner_id
     WHERE t.status = 'PUBLISHED' AND o.status = 'APPROVED'
       AND t.kilos_reserved < t.kilos_total
       AND t.departure_at::date = (LOCALTIMESTAMP + make_interval(days => $1))::date`,
    [days]
  );
  return rows.map((r) => r.id);
}

/**
 * Sélection de la semaine : pour chaque client et chaque destination favorite (ou déjà réservée),
 * le nombre de voyages réservables qui partent dans les 7 prochains jours.
 */
export async function findWeeklyDigestCandidates(userId = null, db = pool) {
  const { rows } = await db.query(
    `SELECT i.user_id, MIN(t.arrival_city) AS destination, COUNT(DISTINCT t.id) AS trips,
            MIN(t.departure_at) AS first_departure
     FROM route_interests i
     JOIN users u ON u.id = i.user_id
     JOIN trips t ON t.arrival_key = i.arrival_key AND (i.departure_key = '' OR t.departure_key = i.departure_key)
     JOIN users o ON o.id = t.owner_id
     WHERE i.source IN ('FAVORITE', 'RESERVATION') AND i.arrival_key <> ''
       AND u.role = 'CLIENT' AND u.status = 'APPROVED' AND u.marketing_route_alerts
       AND o.status = 'APPROVED' AND t.owner_id <> i.user_id
       AND t.status = 'PUBLISHED' AND t.kilos_reserved < t.kilos_total
       AND t.departure_at >= LOCALTIMESTAMP AND t.departure_at < LOCALTIMESTAMP + INTERVAL '7 days'
       AND ($1::int IS NULL OR i.user_id = $1)
     GROUP BY i.user_id, i.arrival_key
     ORDER BY trips DESC`,
    [userId]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    destination: r.destination,
    trips: r.trips,
    firstDeparture: toLocalIso(r.first_departure),
  }));
}

// Même calcul pour un seul client (message de bienvenue après l'accueil)
export const findWeeklyDigestForUser = (userId, db = pool) => findWeeklyDigestCandidates(userId, db);

/* ===================== File d'envoi ===================== */

/** Ajoute des messages à la file ; un doublon (même personne + même clé) est ignoré. Renvoie le nombre ajouté. */
export async function enqueue(items, db = pool) {
  let inserted = 0;
  for (const item of items) {
    const { rowCount } = await db.query(
      `INSERT INTO marketing_queue (user_id, kind, title, body, link, dedupe_key, trip_id, campaign_id, send_after, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()), $10)
       ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [
        item.userId, item.kind, item.title, item.body ?? "", item.link ?? null, item.dedupeKey,
        item.tripId ?? null, item.campaignId ?? null, item.sendAfter ?? null, item.expiresAt ?? null,
      ]
    );
    inserted += rowCount;
  }
  return inserted;
}

/** Messages à envoyer maintenant, avec ce qu'il faut pour décider (préférences, fuseau, voyage encore réservable) */
export async function fetchDue(limit, db = pool) {
  const { rows } = await db.query(
    `SELECT q.*, u.status AS user_status, u.timezone, u.marketing_route_alerts, u.marketing_campaigns,
            (q.trip_id IS NULL OR (t.status = 'PUBLISHED' AND t.departure_at > LOCALTIMESTAMP
                                   AND t.kilos_reserved < t.kilos_total)) AS trip_bookable,
            (q.trip_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM reservations r
               WHERE r.trip_id = q.trip_id AND r.client_id = q.user_id AND r.status <> 'CANCELLED'
            )) AS already_reserved
     FROM marketing_queue q
     JOIN users u ON u.id = q.user_id
     LEFT JOIN trips t ON t.id = q.trip_id
     WHERE q.status = 'PENDING' AND q.send_after <= NOW()
     ORDER BY q.send_after
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// Messages marketing déjà reçus par la personne (plafonds)
export async function countRecentSent(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '1 day')  AS day,
            COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '7 days') AS week
     FROM marketing_queue WHERE user_id = $1 AND status = 'SENT'`,
    [userId]
  );
  return rows[0];
}

export async function markSent(id, notificationId, db = pool) {
  await db.query(
    `UPDATE marketing_queue SET status = 'SENT', sent_at = NOW(), notification_id = $2 WHERE id = $1`,
    [id, notificationId]
  );
}

export async function markSkipped(id, reason, db = pool) {
  await db.query(`UPDATE marketing_queue SET status = 'SKIPPED', skip_reason = $2 WHERE id = $1`, [id, reason]);
}

export async function postpone(id, sendAfter, db = pool) {
  await db.query(`UPDATE marketing_queue SET send_after = $2 WHERE id = $1`, [id, sendAfter]);
}

/* ===================== Campagnes ===================== */

/**
 * Critères d'audience communs au comptage et à l'envoi.
 * audience / destinationKey : expressions SQL (paramètre ou colonne), jamais une saisie utilisateur.
 */
const audienceWhere = (audience, destinationKey) => `
  u.status = 'APPROVED' AND u.marketing_campaigns
  AND ((${audience} = 'ALL' AND u.role IN ('CLIENT', 'VOYAGEUR'))
       OR (${audience} = 'CLIENTS' AND u.role = 'CLIENT')
       OR (${audience} = 'VOYAGEURS' AND u.role = 'VOYAGEUR'))
  AND (${destinationKey} = '' OR EXISTS (
        SELECT 1 FROM route_interests i
        WHERE i.user_id = u.id AND i.arrival_key = ${destinationKey} AND ${RECENT_INTEREST(180)}))`;

export async function countAudience({ audience, destinationCity }, db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS count FROM users u
     WHERE ${audienceWhere("$1::text", "COALESCE(city_key($2::text), '')")}`,
    [audience, destinationCity || null]
  );
  return rows[0].count;
}

export function toCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    audience: row.audience,
    destinationCity: row.destination_city,
    moment: row.moment,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    recipientsCount: row.recipients_count,
    createdAt: row.created_at,
    stats:
      row.sent !== undefined
        ? { sent: row.sent, pending: row.pending, skipped: row.skipped, opened: row.opened }
        : undefined,
  };
}

const CAMPAIGN_COLUMNS = {
  title: "title",
  body: "body",
  link: "link",
  audience: "audience",
  destinationCity: "destination_city",
  moment: "moment",
  status: "status",
  scheduledAt: "scheduled_at",
};

export async function createCampaign(data, createdBy, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (title, body, link, audience, destination_city, moment, status, scheduled_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [data.title, data.body, data.link, data.audience, data.destinationCity || null, data.moment || null,
     data.status, data.scheduledAt || null, createdBy]
  );
  return toCampaign(rows[0]);
}

export async function updateCampaign(id, data, db = pool) {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(CAMPAIGN_COLUMNS)) {
    if (data[key] === undefined) continue;
    values.push(key === "destinationCity" || key === "moment" ? data[key] || null : data[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (!sets.length) return findCampaign(id, db);
  values.push(id);
  const { rows } = await db.query(
    `UPDATE campaigns SET ${sets.join(", ")}
     WHERE id = $${values.length} AND status IN ('DRAFT', 'SCHEDULED') RETURNING *`,
    values
  );
  return toCampaign(rows[0]);
}

export async function findCampaign(id, db = pool) {
  const { rows } = await db.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
  return toCampaign(rows[0]);
}

export async function cancelCampaign(id, db = pool) {
  const { rows } = await db.query(
    `UPDATE campaigns SET status = 'CANCELLED' WHERE id = $1 AND status IN ('DRAFT', 'SCHEDULED') RETURNING *`,
    [id]
  );
  return toCampaign(rows[0]);
}

/** Campagnes avec leurs statistiques (envoyées, en attente, ignorées, ouvertes) */
export async function listCampaigns(db = pool) {
  const { rows } = await db.query(
    `SELECT c.*,
            COUNT(q.id) FILTER (WHERE q.status = 'SENT')     AS sent,
            COUNT(q.id) FILTER (WHERE q.status = 'PENDING')  AS pending,
            COUNT(q.id) FILTER (WHERE q.status = 'SKIPPED')  AS skipped,
            COUNT(n.id) FILTER (WHERE n.read_at IS NOT NULL) AS opened
     FROM campaigns c
     LEFT JOIN marketing_queue q ON q.campaign_id = c.id
     LEFT JOIN notifications n ON n.id = q.notification_id
     GROUP BY c.id
     ORDER BY COALESCE(c.scheduled_at, c.created_at) DESC
     LIMIT 100`
  );
  return rows.map(toCampaign);
}

// Campagnes programmées arrivées à échéance → passent en cours d'envoi (une seule fois)
export async function claimDueCampaigns(db = pool) {
  const { rows } = await db.query(
    `UPDATE campaigns SET status = 'SENDING'
     WHERE status = 'SCHEDULED' AND scheduled_at <= NOW() RETURNING *`
  );
  return rows.map(toCampaign);
}

/** Met toute l'audience de la campagne dans la file (valable 72 h pour respecter plafonds et heures calmes) */
export async function enqueueCampaign(campaignId, validityHours, db = pool) {
  const { rowCount } = await db.query(
    `INSERT INTO marketing_queue (user_id, kind, title, body, link, dedupe_key, campaign_id, expires_at)
     SELECT u.id, 'CAMPAIGN'::notification_type, c.title, c.body, c.link, 'campaign:' || c.id, c.id,
            NOW() + make_interval(hours => $2)
     FROM campaigns c
     JOIN users u ON ${audienceWhere("c.audience::text", "c.destination_key")}
     WHERE c.id = $1
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [campaignId, validityHours]
  );
  await db.query(
    `UPDATE campaigns SET status = 'SENT', recipients_count = $2, sent_at = NOW() WHERE id = $1`,
    [campaignId, rowCount]
  );
  return rowCount;
}

/** Statistiques des 30 derniers jours, par type de message */
export async function statsByKind(db = pool) {
  const { rows } = await db.query(
    `SELECT q.kind,
            COUNT(*) FILTER (WHERE q.status = 'SENT')        AS sent,
            COUNT(*) FILTER (WHERE q.status = 'SKIPPED')     AS skipped,
            COUNT(*) FILTER (WHERE q.status = 'PENDING')     AS pending,
            COUNT(n.id) FILTER (WHERE n.read_at IS NOT NULL) AS opened
     FROM marketing_queue q
     LEFT JOIN notifications n ON n.id = q.notification_id
     WHERE q.created_at > NOW() - INTERVAL '30 days'
     GROUP BY q.kind`
  );
  return rows.map((r) => ({ kind: r.kind, sent: r.sent, skipped: r.skipped, pending: r.pending, opened: r.opened }));
}

/* ===================== Tâches quotidiennes ===================== */

/** Réserve l'exécution du jour d'une tâche : true une seule fois par jour, même avec plusieurs serveurs */
export async function claimDailyRun(name, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO job_runs (name, last_run_on) VALUES ($1, CURRENT_DATE)
     ON CONFLICT (name) DO UPDATE SET last_run_on = CURRENT_DATE
     WHERE job_runs.last_run_on < CURRENT_DATE
     RETURNING name`,
    [name]
  );
  return rows.length > 0;
}

/** Applique les durées de conservation annoncées dans la politique de confidentialité */
export async function purgeOldData({ interestsDays, queueDays, notificationsDays }, db = pool) {
  const interests = await db.query(
    `DELETE FROM route_interests WHERE source IN ('SEARCH', 'VIEW') AND last_seen_at < NOW() - make_interval(days => $1)`,
    [interestsDays]
  );
  const queue = await db.query(`DELETE FROM marketing_queue WHERE created_at < NOW() - make_interval(days => $1)`, [queueDays]);
  const notifications = await db.query(
    `DELETE FROM notifications WHERE created_at < NOW() - make_interval(days => $1)`,
    [notificationsDays]
  );
  return { interests: interests.rowCount, queue: queue.rowCount, notifications: notifications.rowCount };
}
