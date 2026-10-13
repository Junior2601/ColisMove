// =========================================================
//  Formatage des données de l'API pour l'affichage
// =========================================================

/* ---------- Nombres et montants ---------- */

const CURRENCY_SYMBOLS = { XOF: "F", XAF: "F", EUR: "€", USD: "$", RUB: "₽", GBP: "£" };
const numberFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

export const currencySymbol = (currency) => CURRENCY_SYMBOLS[currency] ?? currency;
export const formatNumber = (n) => numberFmt.format(n ?? 0);
export const formatKg = (kilos) => `${formatNumber(kilos)} kg`;
export const formatMoney = (amount, currency) => `${formatNumber(amount)} ${currencySymbol(currency)}`; // 47 500 F
export const formatCompactMoney = (amount, currency) =>
  `${compactFmt.format(amount ?? 0)} ${currencySymbol(currency)}`; // 6,9 M F

// 18 → "+18 %", -4 → "−4 %", null → null
export function formatTrend(percent) {
  if (percent === null || percent === undefined) return null;
  const sign = percent > 0 ? "+" : percent < 0 ? "−" : "";
  return `${sign}${Math.abs(percent)} %`;
}

/* ---------- Dates des VOLS : heures locales "2026-07-25T08:45", jamais converties ---------- */

const parseLocal = (localIso) => new Date(`${localIso.slice(0, 16)}:00Z`);
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const tripDayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const tripShortFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

export const formatTripDate = (localIso) => capitalize(tripDayFmt.format(parseLocal(localIso))); // "Sam. 25 juil."
export const formatTripShortDate = (localIso) => tripShortFmt.format(parseLocal(localIso)); // "25 juil."
export const formatTripTime = (localIso) => localIso.slice(11, 16); // "08:45"

// Champs <input type="date"> + <input type="time"> ↔ "AAAA-MM-JJTHH:mm" attendu par l'API
export const splitLocal = (localIso) => ({ date: localIso.slice(0, 10), time: localIso.slice(11, 16) });
export const joinLocal = (date, time) => `${date}T${time}`;

/* ---------- Dates "réelles" (création, décision…) : fuseau du navigateur ---------- */

const dayMonthFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatDayMonth = (iso) => dayMonthFmt.format(new Date(iso)); // "2 juil."
export const formatDateTime = (iso) => dateTimeFmt.format(new Date(iso)); // "25 juil., 14:32"

// "à l'instant", "il y a 5 min", "il y a 2 h", "hier", "il y a 3 jours", "le 10 juil."
export function timeAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days <= 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return `le ${formatDayMonth(iso)}`;
}

const clockFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export const formatClock = (iso) => clockFmt.format(new Date(iso)); // "14:32"

// Séparateur de jour dans la messagerie : "Aujourd'hui", "Hier", "lun. 12 oct."
export function dayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return capitalize(weekdayFmt.format(date));
}

/* ---------- Personnes ---------- */

export const shortName = (firstName, lastName) => (lastName ? `${firstName} ${lastName[0]}.` : firstName); // "Serge B."
export const fullName = (person) => `${person.firstName} ${person.lastName}`;
// Les voyages de l'admin s'affichent sous la marque "MoveColis"
export const ownerLabel = (owner) => (owner.role === "ADMIN" ? "MoveColis" : shortName(owner.firstName, owner.lastName));
export const digitsOnly = (value) => String(value ?? "").replace(/\D/g, ""); // "+225 07…" → "22507…"
export const formatPhone = (digits) => (digits ? `+${digits}` : ""); // "2250712345678" → "+2250712345678"
export const plural = (count, word) => `${formatNumber(count)} ${word}${count > 1 ? "s" : ""}`;

/* ---------- Trajets ---------- */

export const routeLabel = (trip) => `${trip.departureCity} → ${trip.arrivalCity}`;

// Codes affichés par <RouteLine /> et <TripCard /> (complétez la liste au besoin)
const CITY_CODES = {
  abidjan: "ABJ", moscou: "MOW", paris: "PAR", dakar: "DKR", istanbul: "IST", doha: "DOH",
  lome: "LFW", cotonou: "COO", bamako: "BKO", ouagadougou: "OUA", accra: "ACC", lagos: "LOS",
  conakry: "CKY", niamey: "NIM", yaounde: "NSI", douala: "DLA", libreville: "LBV", kinshasa: "FIH",
  casablanca: "CMN", "addis-abeba": "ADD", dubai: "DXB", bruxelles: "BRU", lyon: "LYS",
  marseille: "MRS", londres: "LON", francfort: "FRA", "saint-petersbourg": "LED",
  "rostov-sur-le-don": "ROV", kazan: "KZN", "new york": "NYC", montreal: "YMQ",
};
const stripAccents = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function cityCode(city) {
  const key = stripAccents(city).toLowerCase().trim();
  return CITY_CODES[key] ?? stripAccents(city).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

// Couleur de couverture d'un voyage (palette MoveColis), toujours la même pour un trajet donné
// (classes écrites en entier ici pour que Tailwind les génère)
const COVER_CLASSES = [
  "from-[#F26122] to-[#C4470F]", // orange MoveColis
  "from-[#1F4372] to-[#0B1F3A]", // bleu → bleu nuit
  "from-[#2F64A7] to-[#1F4372]", // bleu de la boîte
  "from-[#F58A4F] to-[#F26122]", // orange clair
  "from-[#5B6B82] to-[#3A475A]", // gris-bleu
];

export function coverClassFor(trip) {
  const key = `${trip.departureCity}-${trip.arrivalCity}`;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_CLASSES[hash % COVER_CLASSES.length];
}
