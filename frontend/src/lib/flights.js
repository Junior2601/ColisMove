// =========================================================
//  Billets d'avion : affichage et calcul du total (même calcul que le backend)
// =========================================================

import { formatNumber, plural } from "./format";

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

// Version courte, sous la ligne du vol : "Direct", "via Doha", "via Istanbul, Nice"
export function stopsShortLabel(transfers, stops = []) {
  if (!transfers) return "Direct";
  const cities = stopCitiesText(stops);
  return cities ? `via ${cities}` : plural(transfers, "escale");
}

// Détail : "Doha (DOH)", "Istanbul (IST → SAW, changement d'aéroport), Nice (NCE)"
export function stopsDetail(transfers, stops = []) {
  if (!transfers) return "Vol direct";
  if (!stops.length) return plural(transfers, "escale");
  return stops
    .map((stop) => {
      const airports = stop.airports ?? [stop.code];
      const change = airports.length > 1 ? `${airports.join(" → ")}, changement d'aéroport` : airports[0];
      return `${stop.name ?? stop.code} (${change})`;
    })
    .join(", ");
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

/* ---------- Total d'une demande ---------- */

const round2 = (amount) => Math.round(amount * 100) / 100;

// Valises en soute incluses pour la demande : par passager, bébés exclus
export const includedBags = (offer, { adults, children }) => offer.checkedBags * (adults + children);

/**
 * Passagers × prix − valises retirées + options (prix × quantité, × nombre de passagers pour une option « par passager »).
 * quantities : { [optionId]: quantité } · bagsKept : valises gardées (tous passagers)
 * La réduction des valises ne dépasse jamais le prix des billets (même calcul que le backend).
 * → { lines: [{ label, detail, amount }], total, freedKilos }
 */
export function computeTotal(offer, { adults, children, infants }, quantities, options, formatPrice, bagsKept) {
  const lines = [];
  const addPassengers = (count, word, unitPrice) => {
    if (count > 0) lines.push({ label: plural(count, word), detail: `× ${formatPrice(unitPrice)}`, amount: count * unitPrice });
  };
  addPassengers(adults, "adulte", offer.adultPrice);
  addPassengers(children, "enfant", offer.childPrice);
  addPassengers(infants, "bébé", offer.infantPrice);

  const fare = lines.reduce((sum, line) => sum + line.amount, 0);
  const removed = Math.max(0, includedBags(offer, { adults, children }) - (bagsKept ?? Infinity));
  if (removed > 0) {
    const discount = round2(Math.min(removed * offer.bagRefund, fare));
    lines.push({ label: removedBagsLabel(removed), detail: `× −${formatPrice(offer.bagRefund)}`, amount: -discount });
  }

  const passengers = adults + children + infants;
  for (const option of options) {
    const quantity = quantities[option.id] ?? 0;
    if (!quantity) continue;
    const perPassenger = option.unit === "PASSENGER";
    const amount = round2(option.price * quantity * (perPassenger ? passengers : 1));
    const times = quantity * (perPassenger ? passengers : 1);
    lines.push({ label: option.label, detail: `${times} × ${formatPrice(option.price)}`, amount });
  }
  return {
    lines,
    total: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
    freedKilos: removed * offer.checkedBagKg,
  };
}
