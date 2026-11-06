// =========================================================
//  Billets d'avion : affichage et calcul du total (même calcul que le backend)
// =========================================================

import { plural } from "./format";

// Logo de la compagnie (CDN d'Aviasales) : TK → logo Turkish Airlines
export const airlineLogoUrl = (code) => `https://pics.avs.io/120/40/${code}.png`;

// 755 → "12 h 35"
export const formatDuration = (minutes) =>
  minutes ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : "";

export const stopsLabel = (transfers) => (transfers ? plural(transfers, "escale") : "Vol direct");

// { adults: 2, children: 1, infants: 0 } → "2 adultes, 1 enfant"
export function passengersLabel({ adults, children = 0, infants = 0 }) {
  return [plural(adults, "adulte"), children > 0 && plural(children, "enfant"), infants > 0 && plural(infants, "bébé")]
    .filter(Boolean)
    .join(", ");
}

// "Cabine 7 kg · 1 bagage en soute (23 kg)"
export function baggageLabel({ cabinKg, checkedBags, checkedBagKg }) {
  const cabin = cabinKg > 0 ? `Cabine ${cabinKg} kg` : "Sans bagage cabine";
  const hold = checkedBags > 0 ? `${plural(checkedBags, "bagage")} en soute (${checkedBagKg} kg)` : "sans bagage en soute";
  return `${cabin} · ${hold}`;
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

/* ---------- Total d'une demande ---------- */

const round2 = (amount) => Math.round(amount * 100) / 100;

/**
 * Passagers × prix + options (prix × quantité, × nombre de passagers pour une option « par passager »).
 * quantities : { [optionId]: quantité }
 * → { lines: [{ label, detail, amount }], total }
 */
export function computeTotal(offer, { adults, children, infants }, quantities, options, formatPrice) {
  const lines = [];
  const addPassengers = (count, word, unitPrice) => {
    if (count > 0) lines.push({ label: plural(count, word), detail: `× ${formatPrice(unitPrice)}`, amount: count * unitPrice });
  };
  addPassengers(adults, "adulte", offer.adultPrice);
  addPassengers(children, "enfant", offer.childPrice);
  addPassengers(infants, "bébé", offer.infantPrice);

  const passengers = adults + children + infants;
  for (const option of options) {
    const quantity = quantities[option.id] ?? 0;
    if (!quantity) continue;
    const perPassenger = option.unit === "PASSENGER";
    const amount = round2(option.price * quantity * (perPassenger ? passengers : 1));
    const times = quantity * (perPassenger ? passengers : 1);
    lines.push({ label: option.label, detail: `${times} × ${formatPrice(option.price)}`, amount });
  }
  return { lines, total: round2(lines.reduce((sum, line) => sum + line.amount, 0)) };
}
