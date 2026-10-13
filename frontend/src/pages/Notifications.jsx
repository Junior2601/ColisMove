import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import Layout from "../components/Layout";
import { ErrorState, LoadMore, Loader, btnOutline, btnSm } from "../components/ui";
import { notificationsApi } from "../api/notifications";
import { layoutVariantFor, useAuth } from "../context/AuthContext";
import { NOTIFICATION_ICONS, useNotifications } from "../context/NotificationsContext";
import { usePaginated } from "../hooks/useApi";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { timeAgo } from "../lib/format";

// "3 nouveaux messages", "2 nouveautés" : quand plusieurs événements sont regroupés
function groupedLabel(n) {
  if (n.eventCount <= 1) return null;
  return n.type === "NEW_MESSAGE" ? `${n.eventCount} nouveaux messages` : `${n.eventCount} nouveautés`;
}

function NotificationRow({ notification, onOpen }) {
  const Icon = NOTIFICATION_ICONS[notification.type] ?? Bell;
  const unread = !notification.read;
  const grouped = groupedLabel(notification);

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-line-light last:border-0 transition hover:bg-surface ${
        unread ? "bg-[#FFF8F4]" : "bg-white"
      }`}
    >
      <span
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          unread ? "bg-[#FEEFE7] text-primary" : "bg-surface text-muted"
        }`}
      >
        <Icon size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex justify-between gap-2">
          <span className={`text-[14.5px] truncate ${unread ? "font-extrabold" : "font-semibold"}`}>
            {notification.title}
          </span>
          <span className="text-[11.5px] text-muted shrink-0">{timeAgo(notification.createdAt)}</span>
        </span>
        <span className={`block text-[13px] line-clamp-2 ${unread ? "text-ink" : "text-muted"}`}>
          {notification.body}
        </span>
        {grouped && <span className="block text-xs font-bold text-primary mt-0.5">{grouped}</span>}
      </span>
      {unread && <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-2" aria-label="Non lue" />}
    </button>
  );
}

export default function Notifications() {
  const { user } = useAuth();
  const { unreadNotifications, openNotification, refresh } = useNotifications();
  const [markingAll, setMarkingAll] = useState(false);
  const list = usePaginated((page) => notificationsApi.list(page), []);

  // Nouvelle notification ou lecture ailleurs (autre onglet, autre appareil) → liste à jour
  const timer = useRef(null);
  const reloadSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(list.reload, 400);
  };
  useSocketEvent("notification:new", reloadSoon);
  useSocketEvent("notifications:changed", reloadSoon);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      list.setItems((items) => items.map((n) => ({ ...n, read: true })));
      refresh();
    } finally {
      setMarkingAll(false);
    }
  }

  function handleOpen(notification) {
    list.setItems((items) => items.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    openNotification(notification);
  }

  return (
    <Layout variant={layoutVariantFor(user)}>
      <div className="max-w-2xl mx-auto pb-8">
        <div className="flex justify-between items-center flex-wrap gap-2.5 mt-5 mb-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
          {unreadNotifications > 0 && (
            <button type="button" onClick={markAllRead} disabled={markingAll} className={`${btnOutline} ${btnSm}`}>
              <CheckCheck size={15} /> Tout marquer comme lu
            </button>
          )}
        </div>
        <p className="text-muted text-sm">
          Messages, réservations et étapes de vos colis.{" "}
          <Link to="/profil#notifications" className="font-bold underline text-ink">
            Gérer les notifications de cet appareil
          </Link>
        </p>

        <div className="mt-4">
          {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

          {list.loading && list.items.length === 0 ? (
            <Loader />
          ) : list.items.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">
              <Bell size={36} className="mx-auto mb-2 opacity-40" />
              Aucune notification pour l'instant.
            </div>
          ) : (
            <>
              <div className="border border-line-light rounded-2xl overflow-hidden mb-4">
                {list.items.map((n) => (
                  <NotificationRow key={n.id} notification={n} onOpen={handleOpen} />
                ))}
              </div>
              <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
