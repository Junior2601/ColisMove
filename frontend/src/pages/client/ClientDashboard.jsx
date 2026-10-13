import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, MessageCircle, X } from "lucide-react";
import Layout from "../../components/Layout";
import ReservationStatusModal from "../../components/ReservationStatusModal";
import OnboardingRoutes, { onboardingPostponed } from "../../components/OnboardingRoutes";
import { marketingApi } from "../../api/marketing";
import {
  Badge, ErrorState, LoadMore, Loader, StatCard, Toast, btnDanger, btnOutline, btnPrimary, btnSm,
} from "../../components/ui";
import { clientApi } from "../../api/customer";
import { conversationsApi } from "../../api/conversations";
import { useAuth } from "../../context/AuthContext";
import { useApi, usePaginated } from "../../hooks/useApi";
import { useFlash } from "../../hooks/useFlash";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import {
  formatDayMonth, formatKg, formatMoney, formatNumber, formatTripShortDate, formatTripTime, ownerLabel, routeLabel,
} from "../../lib/format";
import { RESERVATION_STATUS } from "../../lib/status";

const TABS = [
  { key: "current", label: "En cours" },
  { key: "delivered", label: "Livrés" },
  { key: "cancelled", label: "Annulés" },
];

// Phrase d'état affichée sous chaque envoi en cours
const STATUS_NOTES = {
  PENDING: (r) => `⏳ En attente de confirmation par ${ownerLabel(r.trip.owner)} : échangez dans la conversation.`,
  CONFIRMED: () => "✅ Confirmée : convenez de la remise du colis dans la conversation.",
  RECEIVED: () => "📦 Colis remis au voyageur.",
  IN_TRANSIT: (r) => `✈️ Actuellement en vol${r.trip.stopCity ? ` · escale à ${r.trip.stopCity}` : ""}.`,
  ARRIVED: (r) => `🛬 Arrivé à ${r.trip.arrivalCity}, bientôt remis au destinataire.`,
};

function subtitle(r) {
  const amount = formatMoney(r.totalAmount, r.currency);
  if (r.status === "DELIVERED") return `livré le ${formatDayMonth(r.updatedAt)} · ${amount}`;
  if (r.status === "CANCELLED") return `annulé le ${formatDayMonth(r.updatedAt)}`;
  return `départ ${formatTripShortDate(r.trip.departureAt)} ${formatTripTime(r.trip.departureAt)} · ${amount}`;
}

function ShipmentCard({ r, onCancel }) {
  const status = RESERVATION_STATUS[r.status];
  const note = STATUS_NOTES[r.status]?.(r);

  return (
    <div className="border border-line-light rounded-xl px-4 py-3.5 bg-white flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2.5">
        <div>
          <div className="font-bold text-[14.5px]">
            <span className="font-mono">{r.trackingCode}</span> · {formatKg(r.kilos)}
          </div>
          <div className="text-[13px] text-muted">{routeLabel(r.trip)} · {subtitle(r)}</div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {note && <div className="text-[13px] text-muted">{note}</div>}

      <div className="flex gap-2 flex-wrap mt-1">
        {r.conversationId && (
          <Link to={`/messages/${r.conversationId}`} className={`${r.unreadCount > 0 ? btnPrimary : btnOutline} ${btnSm}`}>
            <MessageCircle size={15} /> Conversation
            {r.unreadCount > 0 && (
              <span className="bg-white text-primary rounded-full px-1.5 text-[11px] leading-4.5">{r.unreadCount}</span>
            )}
          </Link>
        )}
        <Link to={`/suivi?code=${r.trackingCode}`} className={`${btnOutline} ${btnSm}`}>
          <MapPin size={15} /> Suivi détaillé
        </Link>
        {/* Le client annule seul tant que ce n'est pas confirmé ; ensuite, il en parle au voyageur */}
        {r.status === "PENDING" && (
          <button type="button" onClick={() => onCancel(r)} className={`${btnDanger} ${btnSm}`}>
            <X size={15} /> Annuler
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("current");
  const [cancelling, setCancelling] = useState(null);
  const [flash, showFlash] = useFlash();

  const stats = useApi(() => clientApi.getStats(), []);
  // Accueil personnalisé tant que le client n'a pas indiqué ses trajets favoris
  const marketing = useApi(() => marketingApi.get(), []);
  const [hideOnboarding, setHideOnboarding] = useState(onboardingPostponed);
  const showOnboarding = marketing.data && !marketing.data.onboardingCompleted && !hideOnboarding;
  const list = usePaginated((page) => clientApi.listReservations({ group: tab, ...page }), [tab]);

  // Nouveau message ou changement de statut (même fait ailleurs) → on rafraîchit
  const timer = useRef(null);
  useSocketEvent("inbox:updated", () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      list.reload();
      stats.reload();
    }, 500);
  });

  const s = stats.data;
  const groups = s?.groups ?? {};

  return (
    <Layout variant="client">
      <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Bonjour {user.firstName} 👋</h1>
      <p className="text-muted text-sm mb-4">Voici vos envois et votre historique.</p>

      {showOnboarding && (
        <div className="-mt-2 mb-4">
          <OnboardingRoutes onDone={() => setHideOnboarding(true)} onLater={() => setHideOnboarding(true)} />
        </div>
      )}

      {/* ===== Statistiques (2 colonnes mobile, 4 desktop) ===== */}
      {stats.error && <ErrorState error={stats.error} onRetry={stats.reload} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Envois au total" value={s ? formatNumber(s.total) : "–"} />
        <StatCard label="En cours" value={s ? formatNumber(s.current) : "–"} />
        <StatCard label="Kilos envoyés" value={s ? formatKg(s.kilos) : "–"} />
        <StatCard
          label="Dépensé"
          value={s ? (s.spent.length ? s.spent.map((x) => formatMoney(x.amount, x.currency)).join(" · ") : "0 F") : "–"}
        />
      </div>

      {/* ===== Onglets ===== */}
      <div className="flex gap-1 border-b border-line-light mt-6 mb-4 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t.key ? "text-ink border-ink" : "text-muted border-transparent"
            }`}
          >
            {t.label}
            {groups[t.key] !== undefined && ` (${groups[t.key]})`}
          </button>
        ))}
      </div>

      {/* ===== Liste selon l'onglet actif ===== */}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

      {list.loading && list.items.length === 0 ? (
        <Loader />
      ) : (
        <div className={`transition-opacity ${list.loading ? "opacity-60" : ""}`}>
          <div className="flex flex-col gap-3 pb-6">
            {list.items.map((r) => (
              <ShipmentCard key={r.id} r={r} onCancel={setCancelling} />
            ))}
          </div>

          {!list.loading && !list.error && list.items.length === 0 && (
            <p className="text-muted text-sm text-center py-10">
              {tab === "current" ? (
                <>
                  Aucun envoi en cours.{" "}
                  <Link to="/" className="font-bold underline text-ink">Trouver un voyage</Link>
                </>
              ) : (
                "Rien dans cette catégorie."
              )}
            </p>
          )}

          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </div>
      )}

      {cancelling && (
        <ReservationStatusModal
          nextStatus="CANCELLED"
          title="Annuler ma réservation"
          summary={`${cancelling.trackingCode} · ${formatKg(cancelling.kilos)} · ${routeLabel(cancelling.trip)}.`}
          onClose={() => setCancelling(null)}
          onConfirm={async (note) => {
            await conversationsApi.changeStatus(cancelling.conversationId, "CANCELLED", note);
            setCancelling(null);
            showFlash(`Réservation ${cancelling.trackingCode} annulée.`);
            list.reload();
            stats.reload();
          }}
        />
      )}

      <Toast flash={flash} />
    </Layout>
  );
}
