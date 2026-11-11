/**
 * Billets d'avion : recherche (prix Aviasales mis en cache), règles de l'admin, options.
 *
 * Prix adulte d'un billet = prix Aviasales, simplement converti dans la devise affichée
 * (sans marge ni frais, arrondi seulement à l'unité de la devise).
 * Enfant (2-11 ans) et bébé (< 2 ans) : pourcentage du prix adulte (Aviasales ne donne que le prix adulte).
 * Valises en soute : le client peut en retirer, chacune réduit le prix de `bagRefund` ;
 * les kilos libérés reviennent à MoveColis (espace « Kilos disponibles » de l'admin).
 */
import { withTransaction } from "../config/db.js";
import * as flightModel from "../models/flight.model.js";
import * as aviasales from "./aviasales.service.js";
import { FLIGHT_BAG_REMOVAL_DAYS, FLIGHT_MAX_PASSENGERS, FLIGHT_SEARCH_MONTHS_AHEAD } from "../config/constants.js";
import { badRequest, conflict, notFound } from "../utils/AppError.js";

const round2 = (amount) => Math.round(amount * 100) / 100;

// Nombre de décimales de la devise : XOF → 0, EUR → 2 (mêmes règles que le navigateur)
function currencyDecimals(currency) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

// Arrondi à l'unité de la devise (le franc CFA n'a pas de centimes)
export function roundCurrency(amount, currency) {
  const factor = 10 ** currencyDecimals(currency);
  return Math.round(amount * factor) / factor;
}

/** Prix exacts d'Aviasales, convertis dans la devise affichée */
export function priceOffer(offer, settings) {
  const rate = offer.sourceCurrency === settings.currency ? 1 : settings.exchangeRate;
  const adultPrice = roundCurrency(offer.sourcePrice * rate, settings.currency);
  return {
    adultPrice,
    childPrice: roundCurrency((adultPrice * settings.childPercent) / 100, settings.currency),
    infantPrice: roundCurrency((adultPrice * settings.infantPercent) / 100, settings.currency),
  };
}

/**
 * Retrait de valises : possible seulement jusqu'à FLIGHT_BAG_REMOVAL_DAYS jours avant le départ,
 * pour laisser à MoveColis le temps de trouver des clients pour les kilos libérés.
 * Les jours se comptent en dates locales de la ville de départ (comme la date affichée au client).
 */
export function canRemoveBags({ departureAt, departureUtc }) {
  const lastDay = new Date(`${departureAt.slice(0, 10)}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() - FLIGHT_BAG_REMOVAL_DAYS);
  const utcOffset = Date.parse(`${departureAt.slice(0, 16)}:00Z`) - new Date(departureUtc).getTime(); // fuseau de la ville de départ
  const localToday = new Date(Date.now() + utcOffset).toISOString().slice(0, 10);
  return localToday <= lastDay.toISOString().slice(0, 10);
}

/**
 * Valises en soute d'une demande. Bébés exclus : seuls adultes et enfants ont des valises.
 * bagsKept : valises gardées par le client (undefined = toutes celles incluses).
 * La réduction ne dépasse jamais le prix des billets.
 */
export function computeBags(offer, { adults, children }, bagsKept, fare) {
  const included = offer.checkedBags * (adults + children);
  const kept = bagsKept ?? included;
  if (kept < 0 || kept > included) {
    throw badRequest(`Valises en soute : entre 0 et ${included} pour ${adults + children} passager(s).`);
  }
  if (kept < included && !(offer.bagRefund > 0)) throw badRequest("Ce billet ne permet pas de retirer de valise.");
  if (kept < included && !offer.bagRemovalOpen) {
    throw badRequest(
      "Retirer une valise n'est plus possible : le départ est dans moins de 2 semaines. Gardez toutes les valises incluses."
    );
  }
  const removed = included - kept;
  return {
    included,
    kept,
    removed,
    refund: offer.bagRefund,
    discount: round2(Math.min(removed * offer.bagRefund, fare)),
    freedKilos: removed * offer.checkedBagKg,
  };
}

/**
 * Total d'une demande, calculé côté serveur (le navigateur fait le même calcul pour l'affichage) :
 * passagers × prix − valises retirées + options (prix × quantité, × nombre de passagers pour une option « par passager »).
 */
export function computeTotal(offer, { adults, children, infants }, chosenOptions, availableOptions, bagsKept) {
  const byId = new Map(availableOptions.map((option) => [option.id, option]));
  const passengers = adults + children + infants;
  const fare = adults * offer.adultPrice + children * offer.childPrice + infants * offer.infantPrice;
  const bags = computeBags(offer, { adults, children }, bagsKept, fare);
  let total = fare - bags.discount;

  const lines = [];
  for (const { id, quantity } of chosenOptions) {
    if (!quantity) continue;
    const option = byId.get(id);
    if (!option) throw conflict("Une option choisie n'est plus proposée : rechargez la page.");
    if (quantity > option.maxQuantity) throw badRequest(`« ${option.label} » : ${option.maxQuantity} au maximum.`);
    const amount = round2(option.price * quantity * (option.unit === "PASSENGER" ? passengers : 1));
    lines.push({ id: option.id, label: option.label, unit: option.unit, quantity, unitPrice: option.price, amount });
    total += amount;
  }
  return { options: lines, bags, totalAmount: round2(total) };
}

export async function getSettings() {
  return flightModel.getSettings();
}

/* ===================== Cache des prix Aviasales ===================== */

// "2026-12" → mois de départ accepté (du mois en cours à +11 mois), sinon erreur
function monthRoute(origin, destination, month) {
  if (origin === destination) throw badRequest("Choisissez deux villes différentes.");
  const now = new Date();
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const [year, monthNumber] = month.split("-").map(Number);
  const asked = year * 12 + monthNumber - 1;
  if (asked < current || asked > current + FLIGHT_SEARCH_MONTHS_AHEAD) {
    throw badRequest(`Choisissez un mois de départ entre ce mois-ci et les ${FLIGHT_SEARCH_MONTHS_AHEAD} mois suivants.`);
  }
  return { origin, destination, month: `${month}-01` };
}

const inflight = new Map(); // deux recherches simultanées du même trajet → un seul appel à Aviasales

/**
 * Redemande les prix à Aviasales si ceux du cache ont plus de `cacheHours` heures (ou si force).
 * En cas de panne d'Aviasales, les derniers prix connus restent affichés (stale: true).
 * Renvoie { fetchedAt, stale, error } — fetchedAt = date de la dernière réponse d'Aviasales.
 */
async function ensureFresh(route, settings, { force = false } = {}) {
  const search = await flightModel.getSearch(route);
  const fresh = search?.fetchedAt && Date.now() - search.fetchedAt.getTime() < settings.cacheHours * 3600_000;
  if (fresh && !force) return { fetchedAt: search.fetchedAt, stale: false };

  const key = `${route.origin}-${route.destination}-${route.month}`;
  if (!inflight.has(key)) {
    const job = (async () => {
      const offers = await aviasales.fetchMonthPrices({
        origin: route.origin,
        destination: route.destination,
        month: route.month.slice(0, 7),
        currency: settings.sourceCurrency,
      });
      return withTransaction(async (db) => {
        const saved = await flightModel.upsertOffers(offers, db);
        return flightModel.markFetched(route, saved, db);
      });
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }

  try {
    return { fetchedAt: await inflight.get(key), stale: false };
  } catch (err) {
    if (!search?.fetchedAt) throw err;
    console.error("[billets] Aviasales indisponible, anciens prix affichés :", err.message);
    return { fetchedAt: search.fetchedAt, stale: true, error: err.message };
  }
}

/* ===================== Côté client ===================== */

function assertEnabled(settings) {
  if (!settings.enabled) throw notFound("La vente de billets d'avion n'est pas disponible pour le moment.");
}

/**
 * Bagages d'un billet : modification de l'admin sur ce billet, sinon ceux d'Aviasales, sinon les réglages par défaut.
 *  - checkedBags  : valises en soute par passager (hors bébés)
 *  - checkedBagKg : poids d'une valise (réglage par défaut si Aviasales donne le nombre sans le poids)
 *  - cabinKg      : 0 = aucun bagage cabine, null = inclus mais poids non précisé par Aviasales
 */
export function baggageOf(offer, settings) {
  const fromAviasales = offer.fareCheckedBags !== null && offer.fareCheckedBags !== undefined;
  let cabinKg = offer.cabinKg;
  if (cabinKg === null || cabinKg === undefined) {
    if (offer.fareCabinBag === true) cabinKg = null;
    else if (offer.fareCabinBag === false) cabinKg = 0;
    else cabinKg = settings.defaultCabinKg;
  }
  return {
    checkedBags: offer.checkedBags ?? offer.fareCheckedBags ?? settings.defaultCheckedBags,
    checkedBagKg: offer.fareBagKg ?? settings.checkedBagKg,
    cabinKg,
    // Origine des valises en soute affichées : ADMIN (modifiées), AVIASALES, DEFAULT (réglages)
    baggageSource: offer.checkedBags !== null && offer.checkedBags !== undefined ? "ADMIN" : fromAviasales ? "AVIASALES" : "DEFAULT",
  };
}

// Billet tel que le client le voit (prix calculés, bagages, noms des villes et de la compagnie)
function toPublicOffer(offer, settings, { cities, airlines, stops }) {
  return {
    id: offer.id,
    origin: cities.get(offer.origin) ?? { code: offer.origin, name: offer.origin },
    destination: cities.get(offer.destination) ?? { code: offer.destination, name: offer.destination },
    originAirport: offer.originAirport,
    destinationAirport: offer.destinationAirport,
    departureAt: offer.departureAt,
    arrivalAt: offer.arrivalAt, // heure locale d'arrivée (null = non précisée par Aviasales)
    airline: offer.airline,
    airlineName: airlines.get(offer.airline) ?? offer.airline,
    flightNumber: offer.flightNumber,
    transfers: offer.transfers,
    stops: stops.get(offer.stopAirports.join(" ")) ?? [], // [{ code, name, airports }] villes d'escale
    durationMinutes: offer.durationMinutes,
    ...baggageOf(offer, settings), // checkedBags (par passager, hors bébés), checkedBagKg, cabinKg, baggageSource
    bagRefund: settings.bagRefund, // réduction par valise retirée (0 = impossible)
    bagRemovalOpen: canRemoveBags(offer), // false si le départ est dans moins de 2 semaines
    info: offer.info,
    ...priceOffer(offer, settings),
    currency: settings.currency,
  };
}

// Noms des villes, des compagnies et des villes d'escale (mis en cache par aviasales.service)
async function lookups(offers) {
  const codes = [...new Set(offers.flatMap((o) => [o.origin, o.destination]))];
  const routes = [...new Set(offers.map((o) => o.stopAirports?.join(" ")).filter(Boolean))];
  const [cityList, airlines, stopList] = await Promise.all([
    Promise.all(codes.map((code) => aviasales.cityByCode(code))),
    aviasales.airlineNames([...new Set(offers.map((o) => o.airline).filter(Boolean))]),
    Promise.all(routes.map((route) => aviasales.stopCities(route.split(" ")))),
  ]);
  return {
    cities: new Map(cityList.map((city) => [city.code, city])),
    airlines,
    stops: new Map(routes.map((route, i) => [route, stopList[i]])),
  };
}

// Règles utiles au navigateur pour afficher l'onglet et calculer le total en direct
export async function getPublicConfig() {
  const [settings, options] = await Promise.all([flightModel.getSettings(), flightModel.listOptions({ activeOnly: true })]);
  return {
    enabled: settings.enabled && aviasales.isConfigured(),
    currency: settings.currency,
    childPercent: settings.childPercent,
    infantPercent: settings.infantPercent,
    maxPassengers: FLIGHT_MAX_PASSENGERS,
    monthsAhead: FLIGHT_SEARCH_MONTHS_AHEAD,
    options: options.map(({ id, label, description, price, unit, maxQuantity }) => ({
      id, label, description, price, unit, maxQuantity,
    })),
  };
}

export async function searchCities(term) {
  return aviasales.searchCities(term);
}

/** Billets d'un trajet pour un mois : { origin, destination, month, items, fetchedAt, stale } */
export async function searchOffers({ origin, destination, month, direct }) {
  const settings = await flightModel.getSettings();
  assertEnabled(settings);
  const route = monthRoute(origin, destination, month);

  await flightModel.recordRequest(route);
  const { fetchedAt, stale } = await ensureFresh(route, settings);
  let offers = await flightModel.listForRoute(route, {
    sourceCurrency: settings.sourceCurrency,
    freshSince: fetchedAt,
    minHours: settings.minHoursBeforeDeparture,
  });
  if (direct) offers = offers.filter((offer) => offer.transfers === 0);

  const names = await lookups([{ origin, destination, airline: "" }, ...offers]);
  return {
    origin: names.cities.get(origin),
    destination: names.cities.get(destination),
    month,
    currency: settings.currency,
    fetchedAt,
    stale,
    items: offers.map((offer) => toPublicOffer(offer, settings, names)),
  };
}

/**
 * Un billet disponible à l'achat : visible, dans la dernière réponse d'Aviasales, départ assez lointain.
 * Renvoie aussi les données internes utiles à la demande d'achat (lien Aviasales, réglages).
 */
export async function getAvailableOffer(id) {
  const settings = await flightModel.getSettings();
  assertEnabled(settings);
  const offer = await flightModel.findOffer(id);
  const unavailable = notFound("Ce billet n'est plus disponible. Relancez la recherche pour voir les prix du moment.");
  if (!offer || offer.hidden || offer.sourceCurrency !== settings.sourceCurrency) throw unavailable;

  const route = { origin: offer.origin, destination: offer.destination, month: `${offer.departureAt.slice(0, 7)}-01` };
  const { fetchedAt } = await ensureFresh(route, settings);
  const tooSoon = offer.departureUtc.getTime() < Date.now() + settings.minHoursBeforeDeparture * 3600_000;
  const latest = await flightModel.findOffer(id); // prix éventuellement mis à jour par ensureFresh
  if (tooSoon || latest.fetchedAt < fetchedAt) throw unavailable;

  const names = await lookups([latest]);
  return { offer: latest, publicOffer: toPublicOffer(latest, settings, names), settings };
}

export async function getPublicOffer(id) {
  const [{ publicOffer }, config] = await Promise.all([getAvailableOffer(id), getPublicConfig()]);
  return { offer: publicOffer, config };
}

/* ===================== Administration ===================== */

export async function getAdminSettings() {
  const [settings, options] = await Promise.all([flightModel.getSettings(), flightModel.listOptions()]);
  return {
    settings,
    options,
    apiConfigured: aviasales.isConfigured(), // TRAVELPAYOUTS_TOKEN renseigné sur le serveur
    maxPassengers: FLIGHT_MAX_PASSENGERS,
  };
}

export async function updateSettings(data) {
  const before = await flightModel.getSettings();
  await withTransaction(async (db) => {
    await flightModel.updateSettings(data, db);
    // Les prix déjà enregistrés sont dans l'ancienne devise : on les redemandera à Aviasales
    if (data.sourceCurrency && data.sourceCurrency !== before.sourceCurrency) await flightModel.expireAllSearches(db);
  });
  return getAdminSettings();
}

export async function createOption(data) {
  return flightModel.createOption(data);
}

export async function updateOption(id, data) {
  const option = await flightModel.updateOption(id, data);
  if (!option) throw notFound("Option introuvable.");
  return option;
}

export async function deleteOption(id) {
  // Les demandes déjà faites gardent une copie de leurs options : la suppression est sans risque
  if (!(await flightModel.deleteOption(id))) throw notFound("Option introuvable.");
  return { ok: true };
}

// Billet vu par l'admin : prix Aviasales (et sa conversion), modifications, lien d'achat
function toAdminOffer(offer, settings, names, fetchedAt) {
  return {
    ...toPublicOffer(offer, settings, names),
    sourcePrice: offer.sourcePrice,
    sourceCurrency: offer.sourceCurrency,
    checkedBagsOverride: offer.checkedBags,
    cabinKgOverride: offer.cabinKg,
    // Ce que dit Aviasales sur ce tarif (null = non précisé)
    fare: {
      checkedBags: offer.fareCheckedBags,
      bagKg: offer.fareBagKg,
      cabinBag: offer.fareCabinBag,
      changeable: offer.fareChangeable,
      refundable: offer.fareRefundable,
    },
    hidden: offer.hidden,
    stale: Boolean(fetchedAt && offer.fetchedAt < fetchedAt), // absent de la dernière réponse d'Aviasales
    fetchedAt: offer.fetchedAt,
    editedAt: offer.editedAt,
    purchaseUrl: aviasales.purchaseUrl(offer.link),
    gate: offer.gate, // agence qui vend ce prix sur Aviasales
  };
}

/** Tous les billets d'un trajet pour un mois (masqués et périmés compris). refresh : redemande à Aviasales. */
export async function listAdminOffers({ origin, destination, month, refresh }) {
  const settings = await flightModel.getSettings();
  const route = monthRoute(origin, destination, month);
  let fetchedAt = null;
  let fetchError = null;
  try {
    ({ fetchedAt, error: fetchError = null } = await ensureFresh(route, settings, { force: refresh }));
  } catch (err) {
    fetchError = err.message; // l'admin voit quand même les billets déjà enregistrés
  }
  const offers = await flightModel.listForRoute(route, { sourceCurrency: settings.sourceCurrency, publicOnly: false });
  const names = await lookups([{ origin, destination, airline: "" }, ...offers]);
  return {
    origin: names.cities.get(origin),
    destination: names.cities.get(destination),
    month,
    currency: settings.currency,
    fetchedAt,
    fetchError,
    items: offers.map((offer) => toAdminOffer(offer, settings, names, fetchedAt)),
  };
}

export async function updateOffer(id, data, adminId) {
  const offer = await flightModel.updateOfferAdmin(id, data, adminId);
  if (!offer) throw notFound("Billet introuvable.");
  const [settings, names] = await Promise.all([flightModel.getSettings(), lookups([offer])]);
  const search = await flightModel.getSearch({
    origin: offer.origin,
    destination: offer.destination,
    month: `${offer.departureAt.slice(0, 7)}-01`,
  });
  return toAdminOffer(offer, settings, names, search?.fetchedAt);
}

export async function listRecentSearches() {
  const searches = await flightModel.listRecentSearches(20);
  const codes = [...new Set(searches.flatMap((s) => [s.origin, s.destination]))];
  const cities = new Map((await Promise.all(codes.map((code) => aviasales.cityByCode(code)))).map((c) => [c.code, c]));
  return searches.map((search) => ({
    ...search,
    origin: cities.get(search.origin),
    destination: cities.get(search.destination),
  }));
}
