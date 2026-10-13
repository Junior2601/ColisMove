// =========================================================
//  Outils facultatifs (Google Analytics, pixel Meta)
//  Chargés UNIQUEMENT après consentement : aucun script ni cookie avant.
// =========================================================
import { GA_MEASUREMENT_ID, META_PIXEL_ID } from "../config/cookies";

let analyticsLoaded = false;
let marketingLoaded = false;

function injectScript(src) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function loadGoogleAnalytics() {
  if (analyticsLoaded || !GA_MEASUREMENT_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // eslint-disable-line prefer-rest-params
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false, // application à une seule page : on envoie les pages vues nous-mêmes
    cookie_expires: 13 * 30 * 24 * 3600, // 13 mois au plus
  });
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
  analyticsLoaded = true;
}

function loadMetaPixel() {
  if (marketingLoaded || !META_PIXEL_ID) return;
  // Équivalent du code fourni par Meta, sans script en ligne dans index.html
  const fbq = function fbq() {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); // eslint-disable-line prefer-rest-params
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = window._fbq = fbq;
  injectScript("https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", META_PIXEL_ID);
  marketingLoaded = true;
}

/** Applique les choix : charge les outils acceptés (un outil déjà chargé ne l'est pas deux fois) */
export function applyConsent(choices = {}) {
  if (choices.analytics) loadGoogleAnalytics();
  if (choices.marketing) loadMetaPixel();
}

export const trackersLoaded = () => analyticsLoaded || marketingLoaded;

/** Page vue (appelée à chaque changement de page) — sans effet si rien n'a été accepté */
export function trackPageView(path) {
  if (analyticsLoaded) {
    window.gtag("event", "page_view", { page_path: path, page_location: window.location.href, page_title: document.title });
  }
  if (marketingLoaded) window.fbq("track", "PageView");
}

/** Événement métier (ex. installation de l'appli) — sans effet si rien n'a été accepté */
export function trackEvent(name, params = {}) {
  if (analyticsLoaded) window.gtag("event", name, params);
}

/** Retrait du consentement : suppression des cookies déjà déposés par ces outils */
export function clearOptionalCookies() {
  const names = document.cookie.split(";").map((c) => c.split("=")[0].trim());
  const targets = names.filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid" || n === "_fbp");
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of targets) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}
