// =========================================================
//  Notifications push (Web Push) de cet appareil
// =========================================================
import { pushApi } from "../api/notifications";
import { isIos, isStandalone } from "./pwa";

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// La configuration du serveur ne change pas pendant la visite : un seul appel
let configPromise = null;
function getConfig() {
  configPromise ??= pushApi.config().catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

// Clé publique VAPID (base64 URL) → format attendu par le navigateur
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

const toBase64Url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function getSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * État des notifications sur cet appareil :
 *  ios-install     : iPhone/iPad dans Safari → il faut d'abord ajouter le site à l'écran d'accueil
 *  unsupported     : navigateur sans notifications push
 *  server-disabled : clés VAPID absentes côté serveur
 *  denied          : refusées dans les réglages du navigateur
 *  enabled         : actives sur cet appareil
 *  disabled        : possibles, pas encore activées
 */
export async function getPushStatus() {
  if (isIos() && !isStandalone()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  try {
    if (!(await getConfig()).enabled) return "server-disabled";
  } catch {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const subscription = await getSubscription();
  return Notification.permission === "granted" && subscription ? "enabled" : "disabled";
}

// Abonne l'appareil (ou réutilise l'abonnement) et le relie au compte connecté
async function subscribeAndSave() {
  const { publicKey } = await getConfig();
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  // Clés du serveur changées depuis l'abonnement : on s'abonne à nouveau
  const currentKey = subscription?.options?.applicationServerKey;
  if (subscription && currentKey && toBase64Url(currentKey) !== publicKey) {
    await subscription.unsubscribe();
    subscription = null;
  }

  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true, // obligatoire : chaque push affiche une notification
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await pushApi.subscribe({ ...subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

/** À appeler depuis un clic (obligatoire sur iPhone). Renvoie la permission obtenue. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission === "granted") await subscribeAndSave();
  return permission;
}

export async function disablePush() {
  const subscription = await getSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe();
}

/** Au démarrage et après connexion : si déjà autorisé, (re)lie cet appareil au compte connecté */
export async function syncPushSubscription() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  if (!(await getConfig()).enabled) return;
  await subscribeAndSave();
}

/** Déconnexion : cet appareil ne doit plus recevoir les notifications de ce compte */
export async function detachPushFromAccount() {
  if (!pushSupported()) return;
  const subscription = await getSubscription();
  if (subscription) await pushApi.unsubscribe(subscription.endpoint).catch(() => {});
}
