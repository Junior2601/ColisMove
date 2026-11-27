// =========================================================
//  Billets d'avion : affichage des demandes, passagers et dates
// =========================================================

import { formatNumber, formatTripDate, formatTripTime, plural } from "./format";

// Logo de la compagnie (CDN d'Aviasales) : TK → logo Turkish Airlines
export const airlineLogoUrl = (code) => `https://pics.avs.io/120/40/${code}.png`;

// 755 → "12 h 35"
export const formatDuration = (minutes) =>
  minutes ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : "";

// Villes d'escale : "Doha", "Istanbul, Nice" (code de l'aéroport si la ville n'est pas connue)
export const stopCitiesText = (stops = []) => stops.map((stop) => stop.name ?? stop.code).join(", ");

// "Vol direct", "Escale à Doha", "2 escales : Istanbul, Nice" ("1 escale" si les villes ne sont pas connues)
export function stopsLabel(transfers, stops = []) {
  if (!transfers) return "Vol direct";
  const cities = stopCitiesText(stops);
  if (!cities) return plural(transfers, "escale");
  return transfers === 1 ? `Escale à ${cities}` : `${plural(transfers, "escale")} : ${cities}`;
}

// Jours entre la date de départ et celle d'arrivée (heures locales) : 0, 1, 2…
export function arrivalDayShift(departureAt, arrivalAt) {
  if (!arrivalAt) return 0;
  return Math.round((Date.parse(`${arrivalAt.slice(0, 10)}T00:00Z`) - Date.parse(`${departureAt.slice(0, 10)}T00:00Z`)) / 86_400_000);
}

// "14:55", "14:55 (+1 j)" : heure locale d'arrivée ("" si Aviasales ne la donne pas)
export function arrivalTimeLabel(departureAt, arrivalAt) {
  if (!arrivalAt) return "";
  const shift = arrivalDayShift(departureAt, arrivalAt);
  return `${arrivalAt.slice(11, 16)}${shift > 0 ? ` (+${shift} j)` : ""}`;
}

// { adults: 2, children: 1, infants: 0 } → "2 adultes, 1 enfant"
export function passengersLabel({ adults, children = 0, infants = 0 }) {
  return [plural(adults, "adulte"), children > 0 && plural(children, "enfant"), infants > 0 && plural(infants, "bébé")]
    .filter(Boolean)
    .join(", ");
}

// cabinKg : 0 = aucun bagage cabine, null = inclus mais poids non précisé par Aviasales
export const cabinLabel = (cabinKg) =>
  cabinKg === null || cabinKg === undefined ? "Bagage cabine inclus" : cabinKg > 0 ? `Cabine ${cabinKg} kg` : "Sans bagage cabine";

// Billet : "Cabine 7 kg · 2 valises en soute de 23 kg par passager"
export function baggageLabel({ cabinKg, checkedBags, checkedBagKg }) {
  const cabin = cabinLabel(cabinKg);
  const hold = checkedBags > 0 ? `${plural(checkedBags, "valise")} en soute de ${checkedBagKg} kg par passager` : "sans valise en soute";
  return `${cabin} · ${hold}`;
}

// Demande : "Cabine 7 kg · 1 valise en soute de 23 kg (1 retirée)" (valises gardées, tous passagers)
export function orderBaggageLabel({ flight, bags }) {
  const cabin = cabinLabel(flight.cabinKg);
  const hold = bags.kept > 0 ? `${plural(bags.kept, "valise")} en soute de ${flight.checkedBagKg} kg` : "sans valise en soute";
  const removed = bags.removed > 0 ? ` (${bags.removed} retirée${bags.removed > 1 ? "s" : ""})` : "";
  return `${cabin} · ${hold}${removed}`;
}

// "1 valise retirée", "2 valises retirées"
export const removedBagsLabel = (count) => `${formatNumber(count)} valise${count > 1 ? "s" : ""} retirée${count > 1 ? "s" : ""}`;

/* ---------- Passagers (comme sur le passeport) ---------- */

export const PASSENGER_TYPE_LABELS = { ADULT: "Adulte", CHILD: "Enfant", INFANT: "Bébé" };

export const EMPTY_PASSENGER = { fullName: "", gender: "", birthDate: "", nationality: "", passportNumber: "" };

// { adults: 2, children: 1, infants: 0 } → [["ADULT", 0], ["ADULT", 1], ["CHILD", 0]] : place de chaque passager
export const passengerSlots = ({ adults, children, infants }) => [
  ...Array.from({ length: adults }, (_, i) => ["ADULT", i]),
  ...Array.from({ length: children }, (_, i) => ["CHILD", i]),
  ...Array.from({ length: infants }, (_, i) => ["INFANT", i]),
];

// "1990-03-12" → "12/03/1990"
export const formatBirthDate = (isoDate) => isoDate.split("-").reverse().join("/");

const pad = (n) => String(n).padStart(2, "0");
const toIsoDate = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

// "2026-12-15" − 12 ans → "2014-12-15" (un 29 février devient le 28 si l'année n'est pas bissextile)
function yearsBefore(isoDate, years) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const lastDayOfMonth = new Date(Date.UTC(y - years, m, 0)).getUTCDate();
  return `${y - years}-${pad(m)}-${pad(Math.min(d, lastDayOfMonth))}`;
}

const dayAfter = (isoDate) => toIsoDate(new Date(Date.parse(`${isoDate}T00:00:00Z`) + 86_400_000));

/**
 * Dates de naissance possibles selon le type de passager, à la date du vol (même règle que le serveur) :
 * adulte 12 ans et plus, enfant 2 à 11 ans, bébé moins de 2 ans → { min, max, hint } pour <input type="date">
 */
export function birthDateLimits(type, departureAt) {
  const flightDay = departureAt.slice(0, 10);
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const earliest = (date) => (date < today ? date : today);
  if (type === "ADULT") return { min: "1900-01-01", max: yearsBefore(flightDay, 12), hint: "12 ans ou plus le jour du vol." };
  if (type === "CHILD") {
    return { min: dayAfter(yearsBefore(flightDay, 12)), max: earliest(yearsBefore(flightDay, 2)), hint: "De 2 à 11 ans le jour du vol." };
  }
  return { min: dayAfter(yearsBefore(flightDay, 2)), max: today, hint: "Moins de 2 ans le jour du vol." };
}

/* ---------- Mois de départ ---------- */

const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export const formatMonth = (yyyyMm) => capitalize(monthFmt.format(new Date(`${yyyyMm}-01T00:00:00Z`))); // "Décembre 2026"

// Mois proposés : celui-ci et les `ahead` suivants → [{ value: "2026-12", label: "Décembre 2026" }]
export function upcomingMonths(ahead = 11) {
  const now = new Date();
  return Array.from({ length: ahead + 1 }, (_, i) => {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
    const value = date.toISOString().slice(0, 7);
    return { value, label: formatMonth(value) };
  });
}

// En fin de mois, on propose plutôt le mois suivant (peu de départs restants)
export function defaultMonth() {
  const months = upcomingMonths(1);
  return new Date().getDate() > 20 ? months[1].value : months[0].value;
}

/* ---------- Dates du calendrier ---------- */

// Date du jour dans le fuseau du navigateur : "2026-11-26"
export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "2026-12-15" + 14 → "2026-12-29"
export const addDays = (isoDate, days) => toIsoDate(new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000));

export const isIsoDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && toIsoDate(new Date(`${value}T00:00:00Z`)) === value;

// "2026-12-15" → "Mar. 15 déc."
export const formatDay = (isoDate) => formatTripDate(`${isoDate}T00:00`);

/* ---------- Aller-retour ---------- */

// "Moscou → Abidjan", "Moscou ⇄ Abidjan" (aller-retour)
export const flightRouteLabel = (origin, destination, roundTrip) => `${origin} ${roundTrip ? "⇄" : "→"} ${destination}`;

/**
 * Vols d'une demande, chacun avec ses valises : [{ leg, label, flight, bags }]
 * Aller simple : un vol sans label · aller-retour : "Aller" puis "Retour".
 */
export function orderLegs(order) {
  if (!order.returnFlight) return [{ leg: "OUTBOUND", label: "", flight: order.flight, bags: order.bags }];
  return [
    { leg: "OUTBOUND", label: "Aller", flight: order.flight, bags: order.bags },
    { leg: "RETURN", label: "Retour", flight: order.returnFlight, bags: order.returnBags },
  ];
}

// "mar. 15 déc. · 21:30 → 12:00 (+1 j)" : date, heure de départ et d'arrivée (heures locales)
export const flightTimesLabel = (flight) =>
  `${formatTripDate(flight.departureAt)} · ${formatTripTime(flight.departureAt)}` +
  (flight.arrivalAt ? ` → ${arrivalTimeLabel(flight.departureAt, flight.arrivalAt)}` : "");

// "Air France AF 1234" ; vol retour : "Air France" (Aviasales ne donne pas son numéro)
export const flightNameLabel = (flight) =>
  [flight.airlineName, flight.flightNumber ? `${flight.airline} ${flight.flightNumber}` : !flight.airlineName && flight.airline]
    .filter(Boolean)
    .join(" ");

/* ---------- Vol choisi en direct ---------- */

// Demande en direct pas encore confirmée par l'équipe : seule la date est connue ("mar. 15 déc."), sinon date et heures
export const orderTimesLabel = (order, flight) => (order.awaitingQuote ? formatTripDate(flight.departureAt) : flightTimesLabel(flight));
