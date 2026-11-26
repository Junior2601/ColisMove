/**
 * Recherche en direct (page « Vols en direct », widget Aviasales de marque blanche) : codes de recherche.
 * Le widget met la recherche dans l'adresse de la page (?flightSearch=MOW1112YAO2412211) et son bouton « Partager »
 * copie le lien d'un billet (…&ticketId=39f1…). On ne garde jamais le lien collé, seulement ces deux codes vérifiés.
 */
import { FLIGHT_LIVE_PATH } from "../config/constants.js";

const ddmm = (isoDate) => `${isoDate.slice(8, 10)}${isoDate.slice(5, 7)}`;

/**
 * Code de recherche Aviasales : départ, jour/mois, arrivée, jour/mois du retour (aller-retour), passagers
 * (adultes, puis enfants et bébés s'il y en a). Ex. MOW 11/12 → YAO retour 24/12, 2 adultes, 1 enfant, 1 bébé :
 * "MOW1112YAO2412211" (format vérifié sur le widget).
 */
export function flightSearchCode({ origin, destination, date, returnDate = null, adults, children = 0, infants = 0 }) {
  const passengers = `${adults}${children || infants ? children : ""}${infants ? infants : ""}`;
  return `${origin}${ddmm(date)}${destination}${returnDate ? ddmm(returnDate) : ""}${passengers}`;
}

const SEARCH_CODE = /^[A-Za-z0-9]{8,60}$/;
const TICKET_ID = /^[A-Za-z0-9]{8,64}$/;

/**
 * Lien copié avec « Partager » → { search, ticketId } ; null si ce n'est pas un lien de la page « Vols en direct ».
 * Ex. "https://movecolis.com/vols-en-direct?flightSearch=MOW1112YAO1&ticketId=39f112c1…"
 */
export function parseShareLink(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.pathname.replace(/\/+$/, "") !== FLIGHT_LIVE_PATH) return null;
  const search = url.searchParams.get("flightSearch") ?? "";
  const ticketId = url.searchParams.get("ticketId") ?? "";
  if (!SEARCH_CODE.test(search)) return null;
  return { search, ticketId: TICKET_ID.test(ticketId) ? ticketId : null };
}
