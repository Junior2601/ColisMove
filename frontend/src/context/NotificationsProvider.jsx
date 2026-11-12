import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { notificationsApi } from "../api/notifications";
import { useAuth } from "./AuthContext";
import { NOTIFICATION_ICONS, NotificationsContext } from "./NotificationsContext";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { setAppBadge } from "../lib/pwa";
import { syncPushSubscription } from "../lib/push";

const NO_COUNTS = { notifications: 0, messages: 0 };

/* ===== Toast affiché quand une notification arrive pendant que le site est ouvert ===== */
function NotificationToast({ notification, onOpen, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [notification, onClose]);

  const Icon = NOTIFICATION_ICONS[notification.type] ?? Bell;
  return (
    <div className="fixed top-17 lg:top-21 inset-x-3 sm:inset-x-auto sm:right-5 sm:w-96 z-70" role="status" aria-live="polite">
      <div className="flex items-start gap-3 bg-white border border-line-light rounded-2xl shadow-card-hover px-4 py-3">
        <button type="button" onClick={onOpen} className="flex items-start gap-3 flex-1 min-w-0 text-left">
          <span className="w-9 h-9 rounded-full bg-[#FEEFE7] text-primary flex items-center justify-center shrink-0">
            <Icon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-sm truncate">{notification.title}</span>
            <span className="block text-[13px] text-muted line-clamp-2">{notification.body}</span>
          </span>
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" className="text-muted p-0.5">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Notifications de l'application :
 *  - compteurs temps réel : cloche (notifications) et messagerie (messages non lus)
 *  - pastille sur l'icône de l'appli installée = messages non lus
 *  - toast quand une notification arrive pendant la visite
 *  - ouverture de la bonne page au clic sur une notification push
 *  - abonnement push de l'appareil relié au compte connecté
 */
export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [counts, setCounts] = useState(NO_COUNTS);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  // Connexion / déconnexion / changement de compte : on repart de zéro (pas les compteurs du compte précédent)
  const userId = user?.id ?? null;
  const [countsFor, setCountsFor] = useState(userId);
  if (countsFor !== userId) {
    setCountsFor(userId);
    setCounts(NO_COUNTS);
  }

  const refresh = useCallback(() => {
    notificationsApi.counts().then(setCounts).catch(() => {});
  }, []);

  // Plusieurs événements rapprochés → une seule requête
  const refreshSoon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 400);
  }, [refresh]);

  // Connexion : compteurs + abonnement push de cet appareil
  useEffect(() => {
    if (!user) return;
    refresh();
    syncPushSubscription().catch(() => {});
    return () => clearTimeout(timer.current);
  }, [user, refresh]);

  /* ---------- Temps réel ---------- */
  useSocketEvent("inbox:updated", () => user && refreshSoon());
  useSocketEvent("notifications:changed", () => user && refreshSoon());
  useSocketEvent("connect", () => user && refresh());
  useSocketEvent("notification:new", (notification) => {
    if (!user) return;
    refreshSoon();
    // Pas de toast si l'on est déjà sur la page concernée (ex. la conversation ouverte)
    if (notification.link !== location.pathname) setToast(notification);
  });

  // Pastille de l'icône (PWA) = messages non lus
  useEffect(() => {
    setAppBadge(user ? counts.messages : 0);
  }, [user, counts.messages]);

  // Clic sur une notification push alors que l'appli était déjà ouverte
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type === "navigate") navigate(event.data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  // Arrivée depuis une notification push (?notif=<id>) : on la marque comme lue puis on nettoie l'URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("notif");
    if (!id || !user) return;
    notificationsApi.markRead(id).then(refresh).catch(() => {});
    params.delete("notif");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true, state: location.state });
  }, [location.search, location.pathname, location.state, user, navigate, refresh]);

  const openNotification = useCallback(
    async (notification) => {
      setToast(null);
      if (!notification.read) await notificationsApi.markRead(notification.id).catch(() => {});
      refresh();
      if (notification.link) navigate(notification.link);
    },
    [navigate, refresh]
  );

  const closeToast = useCallback(() => setToast(null), []);

  const value = useMemo(
    () => ({
      unreadNotifications: counts.notifications,
      unreadMessages: counts.messages,
      refresh,
      openNotification,
    }),
    [counts, refresh, openNotification]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {toast && <NotificationToast notification={toast} onOpen={() => openNotification(toast)} onClose={closeToast} />}
    </NotificationsContext.Provider>
  );
}
