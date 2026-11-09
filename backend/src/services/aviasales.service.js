/**
 * Données Aviasales via l'API partenaire officielle Travelpayouts.
 *  - prix   : /aviasales/v3/prices_for_dates (billets trouvés par les utilisateurs d'Aviasales ces dernières 48 h)
 *  - villes : autocomplete.travelpayouts.com (sans clé)
 *  - compagnies : api.travelpayouts.com/data/fr/airlines.json (sans clé)
 * Le reste du code ne connaît que les fonctions exportées ici.
 */
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const PLACES_URL = "https://autocomplete.travelpayouts.com/places2";
const AVIASALES_SITE = "https://www.aviasales.ru";
const TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const isConfigured = () => Boolean(env.aviasales.token);

async function getJson(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new AppError(502, "Le service de billets ne répond pas. Réessayez dans un instant.");
  }
  if (response.status === 401 || response.status === 403) {
    console.error("[aviasales] clé TRAVELPAYOUTS_TOKEN refusée");
    throw new AppError(502, "Le service de billets est mal configuré (clé API refusée).");
  }
  if (response.status === 429) throw new AppError(503, "Trop de recherches en ce moment. Réessayez dans une minute.");
  if (!response.ok) throw new AppError(502, `Le service de billets a répondu une erreur (${response.status}).`);
  return response.json();
}

/* ---------- Petit cache mémoire (villes, compagnies) ---------- */

function memoryCache(ttlMs, maxEntries = 500) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry || entry.expires < Date.now()) return undefined;
      return entry.value;
    },
    set(key, value) {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value); // le plus ancien
      entries.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
  };
}

/* ---------- Villes ---------- */

const placesCache = memoryCache(DAY_MS);

/** "Mosc" → [{ code: "MOW", name: "Moscou", countryName: "Russie" }, …] (villes avec aéroport uniquement) */
export async function searchCities(term) {
  const key = term.toLowerCase();
  const cached = placesCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({ term, locale: "fr" });
  params.append("types[]", "city");
  const rows = await getJson(`${PLACES_URL}?${params}`);
  const cities = (Array.isArray(rows) ? rows : [])
    .filter((row) => /^[A-Z]{3}$/.test(row.code ?? "") && row.name)
    .slice(0, 8)
    .map((row) => ({ code: row.code, name: row.name, countryName: row.country_name ?? "" }));
  return placesCache.set(key, cities);
}

/** "MOW" → { code: "MOW", name: "Moscou", countryName: "Russie" } (le code lui-même si la ville est inconnue) */
export async function cityByCode(code) {
  try {
    const match = (await searchCities(code)).find((city) => city.code === code);
    if (match) return match;
  } catch (err) {
    console.error("[aviasales] ville", code, err.message);
  }
  return { code, name: code, countryName: "" };
}

/* ---------- Compagnies aériennes ---------- */

let airlines = { names: new Map(), expires: 0, loading: null };

async function loadAirlines() {
  const rows = await getJson(`${env.aviasales.apiUrl}/data/fr/airlines.json`);
  const names = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = row.name ?? row.name_translations?.fr ?? row.name_translations?.en;
    if (row.code && name) names.set(row.code, name);
  }
  airlines = { names, expires: Date.now() + DAY_MS, loading: null };
}

/** "TK" → "Turkish Airlines" (le code si la liste est indisponible) */
export async function airlineNames(codes) {
  if (airlines.expires < Date.now()) {
    airlines.loading ??= loadAirlines().catch((err) => {
      console.error("[aviasales] compagnies", err.message);
      airlines = { ...airlines, expires: Date.now() + 10 * 60 * 1000, loading: null }; // nouvel essai dans 10 min
    });
    await airlines.loading;
  }
  return new Map(codes.map((code) => [code, airlines.names.get(code) ?? code]));
}

/* ---------- Conditions du tarif ---------- */

/**
 * Bagages et conditions du tarif, codés par Aviasales dans le lien de chaque billet (paramètre static_fare_key),
 * ex. "TY|P0|H1|L1_2_46|CH1|R0|TBC1" :
 *   L1_2_46 → 2 valises en soute, 46 kg au total (L0 : aucune valise) · H1 → bagage cabine inclus (H0 : aucun)
 *   CH1 → billet modifiable · R1 → billet remboursable (CH0 / R0 : non)
 * Format non documenté, vérifié sur les billets affichés par aviasales.com (Qatar « 2 pcs » = L1_2_46,
 * Royal Air Maroc « 23 kg » = L1_1_23). Code absent ou inconnu → null : les réglages de l'admin s'appliquent.
 */
export function parseFareKey(key) {
  const fare = { checkedBags: null, bagKg: null, cabinBag: null, changeable: null, refundable: null };
  for (const part of String(key ?? "").split("|")) {
    let match;
    if (part === "L0") {
      fare.checkedBags = 0;
    } else if ((match = /^L1_(\d{1,2})_(\d{1,3})$/.exec(part))) {
      const pieces = Number(match[1]);
      const totalKg = Number(match[2]);
      fare.checkedBags = pieces;
      fare.bagKg = pieces > 0 && totalKg > 0 ? Math.round(totalKg / pieces) : null; // 0 : poids non précisé
    } else if ((match = /^H([01])$/.exec(part))) {
      fare.cabinBag = match[1] === "1";
    } else if ((match = /^CH([01])$/.exec(part))) {
      fare.changeable = match[1] === "1";
    } else if ((match = /^R([01])$/.exec(part))) {
      fare.refundable = match[1] === "1";
    }
  }
  return fare;
}

function fareOf(link) {
  if (typeof link !== "string" || !link.startsWith("/")) return parseFareKey(null);
  return parseFareKey(new URL(link, AVIASALES_SITE).searchParams.get("static_fare_key"));
}

/* ---------- Prix ---------- */

/**
 * Billets aller simple d'un trajet pour un mois donné, du moins cher au plus cher.
 * month : "2026-12" · currency : "EUR" | "RUB" | "USD"
 * "2026-12-15T10:35:00+03:00" → departureAt "2026-12-15T10:35" (heure locale) + departureUtc (instant exact)
 */
export async function fetchMonthPrices({ origin, destination, month, currency }) {
  if (!isConfigured()) {
    throw new AppError(503, "La recherche de billets n'est pas encore configurée (clé API Aviasales manquante).");
  }
  const params = new URLSearchParams({
    origin,
    destination,
    departure_at: month,
    one_way: "true",
    direct: "false",
    unique: "false",
    sorting: "price",
    currency: currency.toLowerCase(),
    limit: "200",
    page: "1",
  });
  const body = await getJson(`${env.aviasales.apiUrl}/aviasales/v3/prices_for_dates?${params}`, {
    "X-Access-Token": env.aviasales.token,
  });
  if (body?.success === false) throw new AppError(502, `Le service de billets a refusé la recherche${body.error ? ` : ${body.error}` : "."}`);

  const sourceCurrency = String(body?.currency ?? currency).toUpperCase();
  const offers = [];
  for (const row of Array.isArray(body?.data) ? body.data : []) {
    const departureUtc = new Date(row.departure_at);
    const price = Number(row.price);
    if (!row.airline || Number.isNaN(departureUtc.getTime()) || !(price > 0)) continue;
    offers.push({
      origin,
      destination,
      originAirport: row.origin_airport ?? null,
      destinationAirport: row.destination_airport ?? null,
      departureAt: String(row.departure_at).slice(0, 16),
      departureUtc,
      airline: String(row.airline).slice(0, 3),
      flightNumber: String(row.flight_number ?? "").slice(0, 10) || "—",
      transfers: Number(row.transfers) || 0,
      // duration = trajet complet, escales comprises (duration_to ne compte que les vols)
      durationMinutes: Number(row.duration ?? row.duration_to) || null,
      sourcePrice: price,
      sourceCurrency,
      link: typeof row.link === "string" ? row.link : null,
      gate: typeof row.gate === "string" ? row.gate.slice(0, 80) : null, // agence qui vend ce prix
      fare: fareOf(row.link), // bagages et conditions de ce tarif
    });
  }
  return offers;
}

/** Lien de la recherche sur aviasales.ru (avec l'identifiant partenaire s'il est configuré) */
export function purchaseUrl(link) {
  if (!link?.startsWith("/")) return null; // toujours un chemin du site Aviasales
  const url = new URL(link, AVIASALES_SITE);
  if (env.aviasales.marker) url.searchParams.set("marker", env.aviasales.marker);
  return url.toString();
}
