// =========================================================
//  Vols en direct : recherche Aviasales en temps réel (widget de marque blanche Travelpayouts)
//  Le widget écrit la recherche dans l'adresse de la page (?flightSearch=MOW1112YAO1) et son bouton « Partager »
//  copie le lien d'un billet (…&ticketId=39f1…). Il ne se charge qu'avec l'accord du visiteur (cookies d'Aviasales).
// =========================================================
import { isIsoDate, todayIso } from "./flights";

export const LIVE_FLIGHTS_PATH = "/vols-en-direct";
export const LIVE_ORDER_PATH = "/vols-en-direct/payer";
// Catégorie de cookies acceptée sur la page « Vols en direct » (config/cookies.js)
export const LIVE_CONSENT_KEY = "liveFlights";

// Widget créé dans le compte Travelpayouts de MoveColis pour movecolis.com (identifiant public, pas un secret)
const WIDGET_SRC = "https://tpemb.com/wl_web/main.js?wl_id=25115";

/* ---------- Chargement du widget ---------- */

// Conteneurs du widget : créés une seule fois, puis déplacés d'une visite de la page à l'autre (le widget ne
// s'initialise qu'au chargement de son script : il garde ainsi sa recherche quand on revient sur la page)
let containers = null;
let parking = null;

const div = (id) => Object.assign(document.createElement("div"), { id });

/** Affiche le widget dans `host` (élément vide géré par la page) → fonction qui le range quand la page se ferme */
export function attachLiveWidget(host) {
  if (!containers) {
    containers = [div("tpwl-search"), div("tpwl-tickets")];
    host.append(...containers);
    const script = document.createElement("script");
    script.type = "module";
    script.async = true;
    script.src = WIDGET_SRC;
    document.head.appendChild(script);
  } else {
    host.append(...containers);
  }
  return () => {
    // Rangés hors de vue mais toujours dans la page : le widget les retrouve par leur id
    if (!parking) {
      parking = document.createElement("div");
      parking.hidden = true;
      document.body.appendChild(parking);
    }
    parking.append(...containers);
  };
}

export const liveWidgetLoaded = () => containers !== null;

/** Retrait de l'accord : cookies et stockage déposés par le widget d'Aviasales */
export function clearLiveWidgetData() {
  const names = document.cookie.split(";").map((c) => c.split("=")[0].trim());
  const targets = names.filter((n) => n.startsWith("tpwl_") || n.startsWith("_sp_"));
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of targets) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
  for (const key of ["snowplowOutQueue_sp", "__wlcc"]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // stockage indisponible
    }
  }
}

/* ---------- Codes de recherche ---------- */

const ddmm = (isoDate) => `${isoDate.slice(8, 10)}${isoDate.slice(5, 7)}`;

/**
 * Code de recherche Aviasales (même format que le widget et le serveur) :
 * MOW 11/12 → YAO, retour 24/12, 2 adultes, 1 enfant, 1 bébé → "MOW1112YAO2412211"
 */
export function flightSearchCode({ origin, destination, date, returnDate = null, adults = 1, children = 0, infants = 0 }) {
  const passengers = `${adults}${children || infants ? children : ""}${infants ? infants : ""}`;
  return `${origin}${ddmm(date)}${destination}${returnDate ? ddmm(returnDate) : ""}${passengers}`;
}

// Jour "1112" → prochaine date à venir ("2026-12-11", ou l'année suivante si ce jour est passé)
function nextDate(dd, mm, from) {
  const year = Number(from.slice(0, 4));
  for (const y of [year, year + 1]) {
    const iso = `${y}-${mm}-${dd}`;
    if (isIsoDate(iso) && iso >= from) return iso;
  }
  return null;
}

/**
 * "MOW1112YAO2412211" → { origin, destination, date, returnDate, adults, children, infants }
 * null pour un autre format (itinéraire multi-villes…) ou une date impossible.
 */
export function parseFlightSearch(code, today = todayIso()) {
  const m = /^([A-Z]{3})(\d{2})(\d{2})([A-Z]{3})(?:(\d{2})(\d{2}))?([1-9])(\d)?(\d)?[a-z]?$/.exec(code ?? "");
  if (!m) return null;
  const [, origin, dd, mm, destination, rdd, rmm, adults, children = "0", infants = "0"] = m;
  const date = nextDate(dd, mm, today);
  const returnDate = rdd ? nextDate(rdd, rmm, date ?? today) : null;
  if (!date || (rdd && !returnDate)) return null;
  return { origin, destination, date, returnDate, adults: Number(adults), children: Number(children), infants: Number(infants) };
}

/** Lien copié avec « Partager » → { search, ticketId } ; null si ce n'est pas un lien de la page « Vols en direct » */
export function parseShareLink(text) {
  let url;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.pathname.replace(/\/+$/, "") !== LIVE_FLIGHTS_PATH) return null;
  const search = url.searchParams.get("flightSearch") ?? "";
  const ticketId = url.searchParams.get("ticketId") ?? "";
  if (!/^[A-Za-z0-9]{8,60}$/.test(search)) return null;
  return { search, ticketId: /^[A-Za-z0-9]{8,64}$/.test(ticketId) ? ticketId : null };
}

/** Page « Vols en direct » sur une recherche (et un billet partagé) */
export function liveFlightsHref(search = null, ticketId = null) {
  if (!search) return LIVE_FLIGHTS_PATH;
  return `${LIVE_FLIGHTS_PATH}?flightSearch=${encodeURIComponent(search)}${ticketId ? `&ticketId=${encodeURIComponent(ticketId)}` : ""}`;
}
