// =========================================================
//  PWA : service worker, installation, pastille de l'icône
// =========================================================

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPad en mode "ordinateur"

export const isAndroid = () => /android/i.test(navigator.userAgent);

// Téléphone ou tablette (écran tactile principal)
export const isMobile = () => window.matchMedia("(pointer: coarse)").matches || isIos() || isAndroid();

// Navigateur intégré à une appli (Facebook, Instagram, TikTok…) : l'installation y est impossible
export const isInAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|Line\//i.test(navigator.userAgent);

// Ouvert depuis l'icône de l'écran d'accueil (et non dans le navigateur) ?
export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("Service worker non enregistré :", err);
    return null;
  });
}

/**
 * Pastille sur l'icône de l'appli installée (nombre de messages non lus).
 * Windows / macOS / ChromeOS, et iPhone (iOS 16.4+, appli installée avec notifications autorisées).
 * Android affiche à la place un point quand une notification est présente.
 */
export function setAppBadge(count) {
  if (!("setAppBadge" in navigator)) return;
  const action = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
  action.catch(() => {});
}

/* ---------- Bouton "Installer l'application" (Chrome, Edge, Android) ---------- */
// L'événement peut arriver avant l'affichage de React : on l'intercepte dès le chargement du module
let deferredPrompt = null;
const listeners = new Set();
const notifyListeners = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // on garde l'invitation pour notre propre bouton
    deferredPrompt = event;
    notifyListeners();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyListeners();
  });
}

export const canPromptInstall = () => Boolean(deferredPrompt);

export function onInstallAvailabilityChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notifyListeners();
  return outcome === "accepted";
}
