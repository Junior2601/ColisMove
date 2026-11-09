import { pool } from "../config/db.js";
import { buildSetClause } from "../utils/sql.js";
import { toLocalIso } from "../utils/date.js";

/* ===================== Règles de prix (une seule ligne) ===================== */

const SETTINGS_COLUMNS = {
  enabled: "enabled",
  sourceCurrency: "source_currency",
  currency: "currency",
  exchangeRate: "exchange_rate",
  childPercent: "child_percent",
  infantPercent: "infant_percent",
  defaultCheckedBags: "default_checked_bags",
  defaultCabinKg: "default_cabin_kg",
  checkedBagKg: "checked_bag_kg",
  bagRefund: "bag_refund",
  cacheHours: "cache_hours",
  minHoursBeforeDeparture: "min_hours_before_departure",
};

export function toSettings(row) {
  if (!row) return null;
  const settings = Object.fromEntries(Object.entries(SETTINGS_COLUMNS).map(([key, column]) => [key, row[column]]));
  return { ...settings, updatedAt: row.updated_at };
}

export async function getSettings(db = pool) {
  const { rows } = await db.query(`SELECT * FROM flight_settings WHERE id = 1`);
  return toSettings(rows[0]);
}

export async function updateSettings(fields, db = pool) {
  const { sql, values } = buildSetClause(fields, SETTINGS_COLUMNS);
  if (!sql) return getSettings(db);
  const { rows } = await db.query(`UPDATE flight_settings SET ${sql} WHERE id = 1 RETURNING *`, values);
  return toSettings(rows[0]);
}

/* ===================== Options proposées au client ===================== */

const OPTION_COLUMNS = {
  label: "label",
  description: "description",
  price: "price",
  unit: "unit",
  maxQuantity: "max_quantity",
  active: "active",
  position: "position",
};

export function toOption(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    price: row.price,
    unit: row.unit, // BOOKING | PASSENGER
    maxQuantity: row.max_quantity,
    active: row.active,
    position: row.position,
  };
}

export async function listOptions({ activeOnly = false } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT * FROM flight_options WHERE ($1::boolean = FALSE OR active) ORDER BY position, id`,
    [activeOnly]
  );
  return rows.map(toOption);
}

export async function createOption(data, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO flight_options (label, description, price, unit, max_quantity, active, position)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, (SELECT COALESCE(MAX(position), 0) + 1 FROM flight_options)))
     RETURNING *`,
    [data.label, data.description ?? null, data.price, data.unit, data.maxQuantity, data.active ?? true, data.position ?? null]
  );
  return toOption(rows[0]);
}

export async function updateOption(id, fields, db = pool) {
  const { sql, values } = buildSetClause(fields, OPTION_COLUMNS);
  if (!sql) {
    const { rows } = await db.query(`SELECT * FROM flight_options WHERE id = $1`, [id]);
    return toOption(rows[0]);
  }
  values.push(id);
  const { rows } = await db.query(
    `UPDATE flight_options SET ${sql} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return toOption(rows[0]);
}

export async function deleteOption(id, db = pool) {
  const { rowCount } = await db.query(`DELETE FROM flight_options WHERE id = $1`, [id]);
  return rowCount > 0;
}

/* ===================== Recherches (cache par trajet et par mois) ===================== */
// route = { origin: "MOW", destination: "ABJ", month: "2026-12-01" }

function toSearch(row) {
  if (!row) return null;
  return {
    origin: row.origin,
    destination: row.destination,
    month: row.month_key, // "2026-12" (DATE lue en texte : pas de conversion de fuseau)
    fetchedAt: row.fetched_at,
    offersCount: row.offers_count,
    requests: row.requests,
    lastRequestedAt: row.last_requested_at,
  };
}

export async function getSearch({ origin, destination, month }, db = pool) {
  const { rows } = await db.query(
    `SELECT *, to_char(month, 'YYYY-MM') AS month_key FROM flight_searches WHERE origin = $1 AND destination = $2 AND month = $3::date`,
    [origin, destination, month]
  );
  return toSearch(rows[0]);
}

// Une recherche de client de plus sur ce trajet (statistiques de l'admin)
export async function recordRequest({ origin, destination, month }, db = pool) {
  await db.query(
    `INSERT INTO flight_searches (origin, destination, month, requests) VALUES ($1, $2, $3::date, 1)
     ON CONFLICT (origin, destination, month)
     DO UPDATE SET requests = flight_searches.requests + 1, last_requested_at = NOW()`,
    [origin, destination, month]
  );
}

// Réponse d'Aviasales enregistrée : même NOW() que les billets mis à jour dans la même transaction
export async function markFetched({ origin, destination, month }, offersCount, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO flight_searches (origin, destination, month, fetched_at, offers_count) VALUES ($1, $2, $3::date, NOW(), $4)
     ON CONFLICT (origin, destination, month) DO UPDATE SET fetched_at = NOW(), offers_count = $4
     RETURNING fetched_at`,
    [origin, destination, month, offersCount]
  );
  return rows[0].fetched_at;
}

// Trajets les plus récemment recherchés par les clients (page admin)
export async function listRecentSearches(limit = 20, db = pool) {
  const { rows } = await db.query(
    `SELECT *, to_char(month, 'YYYY-MM') AS month_key FROM flight_searches WHERE month >= date_trunc('month', NOW())::date
     ORDER BY last_requested_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(toSearch);
}

// Changement de devise source : tous les prix seront redemandés à Aviasales
export async function expireAllSearches(db = pool) {
  await db.query(`UPDATE flight_searches SET fetched_at = NULL`);
}

/* ===================== Billets ===================== */

export function toOffer(row) {
  if (!row) return null;
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    originAirport: row.origin_airport,
    destinationAirport: row.destination_airport,
    departureAt: toLocalIso(row.departure_at),
    departureUtc: row.departure_utc,
    airline: row.airline,
    flightNumber: row.flight_number,
    transfers: row.transfers,
    durationMinutes: row.duration_minutes,
    sourcePrice: row.source_price,
    sourceCurrency: row.source_currency,
    link: row.link,
    gate: row.gate,
    fetchedAt: row.fetched_at,
    // Bagages et conditions du tarif selon Aviasales (null = non précisé)
    fareCheckedBags: row.fare_checked_bags,
    fareBagKg: row.fare_bag_kg,
    fareCabinBag: row.fare_cabin_bag,
    fareChangeable: row.fare_changeable,
    fareRefundable: row.fare_refundable,
    // Modifications de l'admin (null = règle générale) ; le prix reste celui d'Aviasales
    checkedBags: row.checked_bags,
    cabinKg: row.cabin_kg,
    info: row.info,
    hidden: row.hidden,
    editedAt: row.edited_at,
  };
}

/**
 * Enregistre les billets reçus d'Aviasales en une requête.
 * Seules les données d'Aviasales sont mises à jour : les modifications de l'admin sont conservées.
 */
export async function upsertOffers(offers, db = pool) {
  // Un même vol en double dans la réponse : on garde le moins cher (sinon ON CONFLICT échoue)
  const unique = new Map();
  for (const offer of offers) {
    const key = [offer.departureAt, offer.airline, offer.flightNumber].join("|");
    if (!unique.has(key) || unique.get(key).sourcePrice > offer.sourcePrice) unique.set(key, offer);
  }
  if (!unique.size) return 0;

  const rows = [...unique.values()].map((o) => ({
    origin: o.origin,
    destination: o.destination,
    origin_airport: o.originAirport,
    destination_airport: o.destinationAirport,
    departure_at: o.departureAt,
    departure_utc: o.departureUtc.toISOString(),
    airline: o.airline,
    flight_number: o.flightNumber,
    transfers: o.transfers,
    duration_minutes: o.durationMinutes,
    source_price: o.sourcePrice,
    source_currency: o.sourceCurrency,
    link: o.link,
    gate: o.gate,
    fare_checked_bags: o.fare?.checkedBags ?? null,
    fare_bag_kg: o.fare?.bagKg ?? null,
    fare_cabin_bag: o.fare?.cabinBag ?? null,
    fare_changeable: o.fare?.changeable ?? null,
    fare_refundable: o.fare?.refundable ?? null,
  }));
  const { rowCount } = await db.query(
    `INSERT INTO flight_offers (origin, destination, origin_airport, destination_airport, departure_at, departure_utc,
                                airline, flight_number, transfers, duration_minutes, source_price, source_currency, link, gate,
                                fare_checked_bags, fare_bag_kg, fare_cabin_bag, fare_changeable, fare_refundable)
     SELECT origin, destination, origin_airport, destination_airport, departure_at, departure_utc,
            airline, flight_number, transfers, duration_minutes, source_price, source_currency, link, gate,
            fare_checked_bags, fare_bag_kg, fare_cabin_bag, fare_changeable, fare_refundable
     FROM jsonb_to_recordset($1::jsonb) AS x(
       origin text, destination text, origin_airport text, destination_airport text, departure_at timestamp,
       departure_utc timestamptz, airline text, flight_number text, transfers smallint, duration_minutes int,
       source_price numeric, source_currency text, link text, gate text,
       fare_checked_bags smallint, fare_bag_kg smallint, fare_cabin_bag boolean, fare_changeable boolean, fare_refundable boolean)
     ON CONFLICT (origin, destination, departure_at, airline, flight_number) DO UPDATE SET
       origin_airport = EXCLUDED.origin_airport,
       destination_airport = EXCLUDED.destination_airport,
       departure_utc = EXCLUDED.departure_utc,
       transfers = EXCLUDED.transfers,
       duration_minutes = EXCLUDED.duration_minutes,
       source_price = EXCLUDED.source_price,
       source_currency = EXCLUDED.source_currency,
       link = EXCLUDED.link,
       gate = EXCLUDED.gate,
       fare_checked_bags = EXCLUDED.fare_checked_bags,
       fare_bag_kg = EXCLUDED.fare_bag_kg,
       fare_cabin_bag = EXCLUDED.fare_cabin_bag,
       fare_changeable = EXCLUDED.fare_changeable,
       fare_refundable = EXCLUDED.fare_refundable,
       fetched_at = NOW()`,
    [JSON.stringify(rows)]
  );
  return rowCount;
}

/**
 * Billets d'un trajet pour un mois, du moins cher au plus cher.
 *  - publicOnly  : sans les billets masqués, ceux absents de la dernière réponse d'Aviasales (freshSince)
 *                  ni ceux qui partent dans moins de minHours heures
 *  - sinon (admin) : tout ce qui n'est pas encore parti
 */
export async function listForRoute(
  { origin, destination, month },
  { sourceCurrency, freshSince = null, minHours = 0, publicOnly = true },
  db = pool
) {
  const { rows } = await db.query(
    `SELECT * FROM flight_offers
     WHERE origin = $1 AND destination = $2
       AND departure_at >= $3::date AND departure_at < ($3::date + INTERVAL '1 month')
       AND source_currency = $4
       AND departure_utc > NOW() + make_interval(hours => $5::int)
       AND ($6::boolean = FALSE OR (NOT hidden AND fetched_at >= $7::timestamptz))
     ORDER BY source_price, departure_at
     LIMIT 300`,
    [origin, destination, month, sourceCurrency, publicOnly ? minHours : 0, publicOnly, freshSince ?? "-infinity"]
  );
  return rows.map(toOffer);
}

export async function findOffer(id, db = pool) {
  const { rows } = await db.query(`SELECT * FROM flight_offers WHERE id = $1`, [id]);
  return toOffer(rows[0]);
}

const OFFER_ADMIN_COLUMNS = {
  checkedBags: "checked_bags",
  cabinKg: "cabin_kg",
  info: "info",
  hidden: "hidden",
};

export async function updateOfferAdmin(id, fields, editorId, db = pool) {
  const { sql, values } = buildSetClause(fields, OFFER_ADMIN_COLUMNS);
  if (!sql) return findOffer(id, db);
  values.push(editorId, id);
  const { rows } = await db.query(
    `UPDATE flight_offers SET ${sql}, edited_at = NOW(), edited_by = $${values.length - 1}
     WHERE id = $${values.length} RETURNING *`,
    values
  );
  return toOffer(rows[0]);
}
