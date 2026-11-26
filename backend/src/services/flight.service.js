/**
 * Billets d'avion : recherche (prix Aviasales mis en cache), règles de l'admin, options.
 *
 * Prix adulte d'un billet = prix Aviasales, simplement converti dans la devise affichée
 * (sans marge ni frais, arrondi seulement à l'unité de la devise).
 * Enfant (2-11 ans) et bébé (< 2 ans) : pourcentage du prix adulte (Aviasales ne donne que le prix adulte).
 * Valises en soute : le client peut en retirer, chacune réduit le prix de `bagRefund` ;
 * les kilos libérés reviennent à MoveColis (espace « Kilos disponibles » de l'admin).
 * Aller-retour : un seul prix pour les deux vols ; les valises se retirent vol par vol (aller, retour ou les deux),
 * chaque vol libérant ses propres kilos.
 */
import { withTransaction } from "../config/db.js";
import * as flightModel from "../models/flight.model.js";
import * as aviasales from "./aviasales.service.js";
import {
  FLIGHT_BAG_REMOVAL_DAYS, FLIGHT_EMPTY_SEARCH_CACHE_MINUTES, FLIGHT_MAX_PASSENGERS, FLIGHT_MAX_ROUND_TRIP_DAYS,
  FLIGHT_SEARCH_MONTHS_AHEAD,
} from "../config/constants.js";
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
 * Valises en soute d'un vol de la demande (aller, ou retour d'un aller-retour). Bébés exclus : seuls adultes et
 * enfants ont des valises. bagsKept : valises gardées par le client (undefined = toutes celles incluses).
 * maxDiscount : la réduction ne dépasse jamais ce qui reste du prix des billets.
 */
export function computeBags(offer, { adults, children }, bagsKept, maxDiscount, leg = "OUTBOUND") {
  const isReturn = leg === "RETURN";
  const included = offer.checkedBags * (adults + children);
  const kept = bagsKept ?? included;
  const flight = isReturn ? " (vol retour)" : "";
  if (kept < 0 || kept > included) {
    throw badRequest(`Valises en soute${flight} : entre 0 et ${included} pour ${adults + children} passager(s).`);
  }
  if (kept < included && !(offer.bagRefund > 0)) throw badRequest("Ce billet ne permet pas de retirer de valise.");
  if (kept < included && !(isReturn ? offer.returnBagRemovalOpen : offer.bagRemovalOpen)) {
    throw badRequest(
      isReturn
        ? "Retirer une valise du vol retour n'est plus possible : il part dans moins de 2 semaines. Gardez toutes les valises incluses."
        : "Retirer une valise n'est plus possible : le départ est dans moins de 2 semaines. Gardez toutes les valises incluses."
    );
  }
  const removed = included - kept;
  return {
    included,
    kept,
    removed,
    refund: offer.bagRefund,
    discount: round2(Math.max(0, Math.min(removed * offer.bagRefund, maxDiscount))),
    freedKilos: removed * offer.checkedBagKg,
  };
}

/**
 * Total d'une demande, calculé côté serveur (le navigateur fait le même calcul pour l'affichage) :
 * passagers × prix − valises retirées (aller, puis retour) + options (prix × quantité, × nombre de passagers pour une
 * option « par passager »). returnBags : null pour un aller simple.
 */
export function computeTotal(offer, { adults, children, infants }, chosenOptions, availableOptions, bagsKept, returnBagsKept) {
  const byId = new Map(availableOptions.map((option) => [option.id, option]));
  const passengers = adults + children + infants;
  const fare = adults * offer.adultPrice + children * offer.childPrice + infants * offer.infantPrice;
  const bags = computeBags(offer, { adults, children }, bagsKept, fare);
  const returnBags = offer.returnFlight
    ? computeBags(offer, { adults, children }, returnBagsKept, fare - bags.discount, "RETURN")
    : null;
  let total = fare - bags.discount - (returnBags?.discount ?? 0);

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
  return { options: lines, bags, returnBags, totalAmount: round2(total) };
}

export async function getSettings() {
  return flightModel.getSettings();
}

/* ===================== Cache des prix Aviasales ===================== */

const monthIndex = (yyyyMm) => {
  const [year, monthNumber] = yyyyMm.split("-").map(Number);
  return year * 12 + monthNumber - 1;
};

/**
 * "2026-12" (et "2027-01" pour un aller-retour) → trajet accepté, sinon erreur :
 * départ du mois en cours à +11 mois ; retour entre le mois du départ et +11 mois.
 */
function monthRoute(origin, destination, month, returnMonth = null) {
  if (origin === destination) throw badRequest("Choisissez deux villes différentes.");
  const now = new Date();
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const asked = monthIndex(month);
  if (asked < current || asked > current + FLIGHT_SEARCH_MONTHS_AHEAD) {
    throw badRequest(`Choisissez un mois de départ entre ce mois-ci et les ${FLIGHT_SEARCH_MONTHS_AHEAD} mois suivants.`);
  }
  if (returnMonth) {
    const back = monthIndex(returnMonth);
    if (back < asked) throw badRequest("Le mois de retour ne peut pas être avant le mois de départ.");
    if (back > current + FLIGHT_SEARCH_MONTHS_AHEAD) {
      throw badRequest(`Choisissez un mois de retour dans les ${FLIGHT_SEARCH_MONTHS_AHEAD} mois qui viennent.`);
    }
  }
  return { origin, destination, month: `${month}-01`, returnMonth: returnMonth ? `${returnMonth}-01` : null };
}

/**
 * Les codes de ville viennent de l'URL : un code inventé (origine=XYZ) ne déclenche ni appel à Aviasales ni
 * entrée dans « Trajets recherchés par les clients ».
 */
async function assertKnownCities(...codes) {
  const known = await Promise.all(codes.map((code) => aviasales.isKnownCity(code)));
  if (known.some((value) => value === false)) throw badRequest("Ville inconnue : choisissez-la dans la liste.");
}

// "2026-12-15" → "2026-12-01" (mois de ce jour)
const monthOf = (isoDate) => `${isoDate.slice(0, 7)}-01`;

/**
 * "2026-12-15" (et "2027-01-05" pour un aller-retour) → recherche du client à ces jours exacts, sinon erreur :
 * départ d'aujourd'hui à la fin du 11e mois suivant ; retour le jour du départ ou après, dans la même période.
 */
function dayRoute(origin, destination, date, returnDate = null) {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + FLIGHT_SEARCH_MONTHS_AHEAD + 1, 0))
    .toISOString()
    .slice(0, 10);
  if (date < now.toISOString().slice(0, 10)) throw badRequest("La date de départ est déjà passée.");
  if (date > lastDay || (returnDate && returnDate > lastDay)) {
    throw badRequest(`Choisissez des dates dans les ${FLIGHT_SEARCH_MONTHS_AHEAD} prochains mois.`);
  }
  if (returnDate && returnDate < date) throw badRequest("La date de retour ne peut pas être avant la date de départ.");
  const route = monthRoute(origin, destination, date.slice(0, 7), returnDate ? returnDate.slice(0, 7) : null);
  return { ...route, day: date, returnDay: returnDate };
}

// Mois entier autour de la recherche du client : sert aux « dates proches »
const monthRouteOf = ({ origin, destination, month, returnMonth }) => ({ origin, destination, month, returnMonth });

/** Recherche à laquelle appartient un billet : ses jours exacts (achat), ou ses mois (liste de l'admin) */
const routeOfOffer = (offer, { byDay = true } = {}) => ({
  origin: offer.origin,
  destination: offer.destination,
  month: monthOf(offer.departureAt),
  returnMonth: offer.returnAt ? monthOf(offer.returnAt) : null,
  ...(byDay && { day: offer.departureAt.slice(0, 10), returnDay: offer.returnAt ? offer.returnAt.slice(0, 10) : null }),
});

const inflight = new Map(); // deux recherches simultanées du même trajet → un seul appel à Aviasales

/**
 * Redemande les prix à Aviasales si ceux du cache ont plus de `cacheHours` heures (ou si force).
 * Une réponse vide est redemandée bien plus tôt (15 min) : Aviasales n'a que les prix cherchés récemment sur son site,
 * un billet peut donc apparaître peu après (ex. Moscou → Yaoundé).
 * En cas de panne d'Aviasales, les derniers prix connus restent affichés (stale: true).
 * Renvoie { fetchedAt, stale, error } — fetchedAt = date de la dernière réponse d'Aviasales.
 */
async function ensureFresh(route, settings, { force = false } = {}) {
  const search = await flightModel.getSearch(route);
  const maxAgeMs = search?.offersCount === 0
    ? Math.min(FLIGHT_EMPTY_SEARCH_CACHE_MINUTES * 60_000, settings.cacheHours * 3600_000)
    : settings.cacheHours * 3600_000;
  const fresh = search?.fetchedAt && Date.now() - search.fetchedAt.getTime() < maxAgeMs;
  if (fresh && !force) return { fetchedAt: search.fetchedAt, stale: false };

  const key = [route.origin, route.destination, route.month, route.returnMonth ?? "aller", route.day ?? "", route.returnDay ?? ""].join("-");
  if (!inflight.has(key)) {
    const job = (async () => {
      // Jour exact (recherche du client) ou mois entier (admin, dates proches)
      const returnPeriod = route.returnDay ?? (route.returnMonth ? route.returnMonth.slice(0, 7) : null);
      const offers = await aviasales.fetchMonthPrices({
        origin: route.origin,
        destination: route.destination,
        month: route.day ?? route.month.slice(0, 7),
        returnMonth: returnPeriod,
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

// Vol retour d'un aller-retour, tel que le client le voit (null : aller simple)
function returnFlightOf(offer, { cities, stops }) {
  if (!offer.returnAt) return null;
  return {
    origin: cities.get(offer.destination), // le retour part de la ville d'arrivée de l'aller
    destination: cities.get(offer.origin),
    departureAt: offer.returnAt, // heure locale de départ du retour
    arrivalAt: offer.returnArrivalAt, // heure locale d'arrivée (null = non précisée par Aviasales)
    originAirport: offer.returnOriginAirport,
    destinationAirport: offer.returnDestinationAirport,
    transfers: offer.returnTransfers ?? 0,
    stops: stops.get(offer.returnStopAirports.join(" ")) ?? [],
    durationMinutes: offer.returnDurationMinutes,
  };
}

// Billet tel que le client le voit (prix calculés, bagages, noms des villes et de la compagnie)
function toPublicOffer(offer, settings, names) {
  const { cities, airlines, stops } = names;
  return {
    id: offer.id,
    tripType: offer.tripType, // ONE_WAY | ROUND_TRIP
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
    // Aller-retour : le vol retour, et ses valises retirables jusqu'à 2 semaines avant son propre départ
    returnFlight: returnFlightOf(offer, names),
    returnBagRemovalOpen: offer.returnAt ? canRemoveBags({ departureAt: offer.returnAt, departureUtc: offer.returnUtc }) : false,
    info: offer.info,
    ...priceOffer(offer, settings),
    currency: settings.currency,
  };
}

// Noms des villes, des compagnies et des villes d'escale (mis en cache par aviasales.service)
async function lookups(offers) {
  const codes = [...new Set(offers.flatMap((o) => [o.origin, o.destination]))];
  const routes = [
    ...new Set(offers.flatMap((o) => [o.stopAirports?.join(" "), o.returnStopAirports?.join(" ")]).filter(Boolean)),
  ];
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

// Vols directs : à l'aller comme au retour
const directOnly = (offers, direct) => (direct ? offers.filter((offer) => offer.transfers === 0 && !offer.returnTransfers) : offers);

// Écart en jours entre deux dates "AAAA-MM-JJ"
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00Z`) - Date.parse(`${a}T00:00Z`)) / 86_400_000);

/**
 * Dates proches de celles du client, avec le prix le plus bas de chacune (billets du mois entier) :
 * [{ date, returnDate, price }] — les plus proches d'abord, sans les dates demandées. Le mois est chargé en même
 * temps que la recherche exacte ; s'il échoue, la recherche du client s'affiche quand même, sans dates proches.
 */
async function nearbyDates(route, settings, direct, limit = 8) {
  try {
    const wholeMonth = monthRouteOf(route);
    const { fetchedAt } = await ensureFresh(wholeMonth, settings);
    const offers = directOnly(
      await flightModel.listForRoute(wholeMonth, {
        sourceCurrency: settings.sourceCurrency,
        freshSince: fetchedAt,
        minHours: settings.minHoursBeforeDeparture,
      }),
      direct
    );
    const best = new Map(); // "départ|retour" → prix le plus bas
    for (const offer of offers) {
      const date = offer.departureAt.slice(0, 10);
      const returnDate = offer.returnAt ? offer.returnAt.slice(0, 10) : null;
      if (date === route.day && returnDate === route.returnDay) continue;
      // Aller-retour de plus de 30 jours : Aviasales refuserait de le chercher au jour exact
      if (returnDate && daysBetween(date, returnDate) > FLIGHT_MAX_ROUND_TRIP_DAYS) continue;
      const key = `${date}|${returnDate ?? ""}`;
      const { adultPrice } = priceOffer(offer, settings);
      if (!best.has(key) || adultPrice < best.get(key).price) best.set(key, { date, returnDate, price: adultPrice });
    }
    const distance = (d) => Math.abs(daysBetween(route.day, d.date)) + (d.returnDate ? Math.abs(daysBetween(route.returnDay, d.returnDate)) : 0);
    return [...best.values()]
      .sort((a, b) => distance(a) - distance(b) || a.price - b.price)
      .slice(0, limit)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.returnDate ?? "").localeCompare(b.returnDate ?? ""));
  } catch (err) {
    console.error("[billets] dates proches :", err.message);
    return [];
  }
}

/**
 * Billets d'un trajet à une date exacte, choisie par le client dans le calendrier :
 * { origin, destination, date, returnDate, tripType, items, nearby, fetchedAt, stale }
 *  - returnDate : aller-retour avec retour ce jour-là (absent : aller simple)
 *  - nearby     : autres dates du même mois avec leur prix le plus bas (le client change de date en un clic)
 */
export async function searchOffers({ origin, destination, date, returnDate = null, direct }) {
  const settings = await flightModel.getSettings();
  assertEnabled(settings);
  const route = dayRoute(origin, destination, date, returnDate);
  await assertKnownCities(origin, destination);
  await flightModel.recordRequest(route);
  const [{ fetchedAt, stale }, nearby] = await Promise.all([
    ensureFresh(route, settings),
    nearbyDates(route, settings, direct),
  ]);
  const offers = directOnly(
    await flightModel.listForRoute(route, {
      sourceCurrency: settings.sourceCurrency,
      freshSince: fetchedAt,
      minHours: settings.minHoursBeforeDeparture,
    }),
    direct
  );

  const names = await lookups([{ origin, destination, airline: "" }, ...offers]);
  return {
    origin: names.cities.get(origin),
    destination: names.cities.get(destination),
    date,
    returnDate,
    tripType: returnDate ? "ROUND_TRIP" : "ONE_WAY",
    currency: settings.currency,
    fetchedAt,
    stale,
    items: offers.map((offer) => toPublicOffer(offer, settings, names)),
    nearby,
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

  const { fetchedAt } = await ensureFresh(routeOfOffer(offer), settings);
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

/**
 * Tous les billets d'un trajet pour un mois (masqués et périmés compris). refresh : redemande à Aviasales.
 * returnMonth : billets aller-retour avec un retour ce mois-là (absent : aller simple)
 */
export async function listAdminOffers({ origin, destination, month, returnMonth = null, refresh }) {
  const settings = await flightModel.getSettings();
  const route = monthRoute(origin, destination, month, returnMonth);
  await assertKnownCities(origin, destination);
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
    returnMonth,
    tripType: returnMonth ? "ROUND_TRIP" : "ONE_WAY",
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
  const search = await flightModel.getSearch(routeOfOffer(offer, { byDay: false })); // liste de l'admin : par mois
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
