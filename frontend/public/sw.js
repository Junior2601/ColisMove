/* =========================================================
 *  Service worker MoveColis
 *  - rend le site installable (PWA) avec une page hors ligne
 *  - reçoit les notifications push, même site fermé
 *  - met à jour la pastille de l'icône (messages non lus)
 * ========================================================= */

const CACHE = "movecolis-v2"; // l'ancien cache est supprimé à l'activation
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting(); // la nouvelle version prend la main sans attendre la fermeture des onglets
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

// Navigation sans réseau → page hors ligne. Le reste (API, Socket.io, fichiers) passe normalement.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

/* ---------- Pastille sur l'icône de l'appli ---------- */
async function updateBadge(count) {
  if (typeof count !== "number" || !self.navigator.setAppBadge) return;
  try {
    if (count > 0) await self.navigator.setAppBadge(count);
    else await self.navigator.clearAppBadge();
  } catch {
    // non pris en charge sur cet appareil : sans gravité
  }
}

/* ---------- Réception d'une notification push ---------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MoveColis", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      await updateBadge(data.badgeCount);

      const target = new URL(data.url || "/", self.location.origin);
      if (data.notificationId) target.searchParams.set("notif", data.notificationId); // marquée lue à l'ouverture

      // La personne regarde déjà cette page (ex. la conversation) : pas de notification en double
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const alreadyThere = windows.some(
        (client) => client.focused && client.visibilityState === "visible" && new URL(client.url).pathname === target.pathname
      );
      if (alreadyThere) return;

      await self.registration.showNotification(data.title || "MoveColis", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png", // petite icône de la barre d'état Android
        tag: data.tag, // même conversation → remplace la notification précédente
        renotify: Boolean(data.tag), // … mais fait quand même sonner / vibrer
        data: { url: target.pathname + target.search },
      });
    })()
  );
});

/* ---------- Clic sur une notification ---------- */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        // L'appli est déjà ouverte : on la met au premier plan et on lui demande d'aller sur la page
        await existing.focus();
        existing.postMessage({ type: "navigate", url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
