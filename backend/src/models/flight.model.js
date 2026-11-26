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

/* ===================== Recherches (cache par trajet, par mois ou par jour) ===================== */
// route = { origin: "MOW", destination: "ABJ", month: "2026-12-01", returnMonth: "2027-01-01" | null (aller simple),
//           day: "2026-12-15" | null (mois entier), returnDay: "2027-01-05" | null }
// Client : jour exact choisi dans le calendrier · admin et « dates proches » : mois entier (day null)

// Clé de cache : mêmes expressions que l'index unique (date fixe à la place d'une valeur absente)
const SEARCH_CONFLICT = `ON CONFLICT (origin, destination, month, (COALESCE(return_month, DATE '1900-01-01')),
  (COALESCE(day, DATE '1900-01-01')), (COALESCE(return_day, DATE '1900-01-01')))`;
const SEARCH_SELECT = `SELECT *, to_char(month, 'YYYY-MM') AS month_key, to_char(return_month, 'YYYY-MM') AS return_month_key,
         to_char(day, 'YYYY-MM-DD') AS day_key, to_char(return_day, 'YYYY-MM-DD') AS return_day_key
  FROM flight_searches`;

function toSearch(row) {
  if (!row) return null;
  return {
    origin: row.origin,
    destination: row.destination,
    month: row.month_key, // "2026-12" (DATE lue en texte : pas de conversion de fuseau)
    returnMonth: row.return_month_key ?? null, // "2027-01" (aller-retour) ou null (aller simple)
    day: row.day_key ?? null, // "2026-12-15" (jour choisi par le client) ou null (mois entier)
    returnDay: row.return_day_key ?? null,
    fetchedAt: row.fetched_at,
    offersCount: row.offers_count,
    requests: row.requests,
    lastRequestedAt: row.last_requested_at,
  };
}

export async function getSearch({ origin, destination, month, returnMonth = null, day = null, returnDay = null }, db = pool) {
  const { rows } = await db.query(
    `${SEARCH_SELECT}
     WHERE origin = $1 AND destination = $2 AND month = $3::date AND return_month IS NOT DISTINCT FROM $4::date
       AND day IS NOT DISTINCT FROM $5::date AND return_day IS NOT DISTINCT FROM $6::date`,
    [origin, destination, month, returnMonth, day, returnDay]
  );
  return toSearch(rows[0]);
}

// Une recherche de client de plus sur ce trajet (statistiques de l'admin)
export async function recordRequest({ origin, destination, month, returnMonth = null, day = null, returnDay = null }, db = pool) {
  await db.query(
    `INSERT INTO flight_searches (origin, destination, month, return_month, day, return_day, requests)
     VALUES ($1, $2, $3::date, $4::date, $5::date, $6::date, 1)
     ${SEARCH_CONFLICT}
     DO UPDATE SET requests = flight_searches.requests + 1, last_requested_at = NOW()`,
    [origin, destination, month, returnMonth, day, returnDay]
  );
}

// Réponse d'Aviasales enregistrée : même NOW() que les billets mis à jour dans la même transaction
export async function markFetched(
  { origin, destination, month, returnMonth = null, day = null, returnDay = null },
  offersCount,
  db = pool
) {
  const { rows } = await db.query(
    `INSERT INTO flight_searches (origin, destination, month, return_month, day, return_day, fetched_at, offers_count)
     VALUES ($1, $2, $3::date, $4::date, $5::date, $6::date, NOW(), $7)
     ${SEARCH_CONFLICT} DO UPDATE SET fetched_at = NOW(), offers_count = $7
     RETURNING fetched_at`,
    [origin, destination, month, returnMonth, day, returnDay, offersCount]
  );
  return rows[0].fetched_at;
}

// Trajets les plus récemment recherchés par les clients (page admin ; sans les mois chargés pour les dates proches)
export async function listRecentSearches(limit = 20, db = pool) {
  const { rows } = await db.query(
    `${SEARCH_SELECT} WHERE month >= date_trunc('month', NOW())::date AND requests > 0
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
    arrivalAt: row.arrival_at ? toLocalIso(row.arrival_at) : null, // heure locale d'arrivée
    airline: row.airline,
    flightNumber: row.flight_number,
    transfers: row.transfers,
    stopAirports: row.stop_airports ? row.stop_airports.split(" ") : [], // ["IST", "SAW", "NCE"]
    durationMinutes: row.duration_minutes,
    // Vol retour d'un aller-retour ; null : aller simple
    tripType: row.return_at ? "ROUND_TRIP" : "ONE_WAY",
    returnAt: row.return_at ? toLocalIso(row.return_at) : null,
    returnUtc: row.return_utc ?? null,
    returnArrivalAt: row.return_arrival_at ? toLocalIso(row.return_arrival_at) : null,
    returnOriginAirport: row.return_origin_airport ?? null,
    returnDestinationAirport: row.return_destination_airport ?? null,
    returnTransfers: row.return_transfers ?? null,
    returnStopAirports: row.return_stop_airports ? row.return_stop_airports.split(" ") : [],
    returnDurationMinutes: row.return_duration_minutes ?? null,
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
    const key = [offer.departureAt, offer.airline, offer.flightNumber, offer.returnAt ?? ""].join("|");
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
    arrival_at: o.arrivalAt ?? null,
    airline: o.airline,
    flight_number: o.flightNumber,
    transfers: o.transfers,
    stop_airports: o.stopAirports?.length ? o.stopAirports.join(" ").slice(0, 60) : null,
    duration_minutes: o.durationMinutes,
    return_at: o.returnAt ?? null,
    return_utc: o.returnUtc ? o.returnUtc.toISOString() : null,
    return_arrival_at: o.returnArrivalAt ?? null,
    return_origin_airport: o.returnOriginAirport ?? null,
    return_destination_airport: o.returnDestinationAirport ?? null,
    return_transfers: o.returnAt ? (o.returnTransfers ?? 0) : null,
    return_stop_airports: o.returnStopAirports?.length ? o.returnStopAirports.join(" ").slice(0, 60) : null,
    return_duration_minutes: o.returnDurationMinutes ?? null,
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
                                arrival_at, airline, flight_number, transfers, stop_airports, duration_minutes,
                                return_at, return_utc, return_arrival_at, return_origin_airport, return_destination_airport,
                                return_transfers, return_stop_airports, return_duration_minutes,
                                source_price, source_currency, link, gate,
                                fare_checked_bags, fare_bag_kg, fare_cabin_bag, fare_changeable, fare_refundable)
     SELECT origin, destination, origin_airport, destination_airport, departure_at, departure_utc,
            arrival_at, airline, flight_number, transfers, stop_airports, duration_minutes,
            return_at, return_utc, return_arrival_at, return_origin_airport, return_destination_airport,
            return_transfers, return_stop_airports, return_duration_minutes,
            source_price, source_currency, link, gate,
            fare_checked_bags, fare_bag_kg, fare_cabin_bag, fare_changeable, fare_refundable
     FROM jsonb_to_recordset($1::jsonb) AS x(
       origin text, destination text, origin_airport text, destination_airport text, departure_at timestamp,
       departure_utc timestamptz, arrival_at timestamp, airline text, flight_number text, transfers smallint,
       stop_airports text, duration_minutes int,
       return_at timestamp, return_utc timestamptz, return_arrival_at timestamp, return_origin_airport text,
       return_destination_airport text, return_transfers smallint, return_stop_airports text, return_duration_minutes int,
       source_price numeric, source_currency text, link text, gate text,
       fare_checked_bags smallint, fare_bag_kg smallint, fare_cabin_bag boolean, fare_changeable boolean, fare_refundable boolean)
     ON CONFLICT (origin, destination, departure_at, airline, flight_number, (COALESCE(return_at, TIMESTAMP '1900-01-01')))
     DO UPDATE SET
       origin_airport = EXCLUDED.origin_airport,
       destination_airport = EXCLUDED.destination_airport,
       departure_utc = EXCLUDED.departure_utc,
       arrival_at = EXCLUDED.arrival_at,
       transfers = EXCLUDED.transfers,
       stop_airports = EXCLUDED.stop_airports,
       duration_minutes = EXCLUDED.duration_minutes,
       return_utc = EXCLUDED.return_utc,
       return_arrival_at = EXCLUDED.return_arrival_at,
       return_origin_airport = EXCLUDED.return_origin_airport,
       return_destination_airport = EXCLUDED.return_destination_airport,
       return_transfers = EXCLUDED.return_transfers,
       return_stop_airports = EXCLUDED.return_stop_airports,
       return_duration_minutes = EXCLUDED.return_duration_minutes,
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
 * Billets d'un trajet pour un mois de départ, du moins cher au plus cher : aller simple (returnMonth null) ou
 * aller-retour avec un retour dans returnMonth (jamais les deux mélangés). day / returnDay : ce jour-là seulement.
 *  - publicOnly  : sans les billets masqués, ceux absents de la dernière réponse d'Aviasales (freshSince)
 *                  ni ceux qui partent dans moins de minHours heures
 *  - sinon (admin) : tout ce qui n'est pas encore parti
 */
export async function listForRoute(
  { origin, destination, month, returnMonth = null, day = null, returnDay = null },
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
       AND (CASE WHEN $8::date IS NULL THEN return_at IS NULL
                 ELSE return_at >= $8::date AND return_at < ($8::date + INTERVAL '1 month') END)
       AND ($9::date IS NULL OR departure_at::date = $9::date)
       AND ($10::date IS NULL OR return_at::date = $10::date)
     ORDER BY source_price, departure_at
     LIMIT 300`,
    [
      origin, destination, month, sourceCurrency, publicOnly ? minHours : 0, publicOnly, freshSince ?? "-infinity",
      returnMonth, day, returnDay,
    ]
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
