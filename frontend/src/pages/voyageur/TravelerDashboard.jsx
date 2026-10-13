import { useRef } from "react";
import { Link } from "react-router-dom";
import { Plus, Plane, Package, ChevronRight, MessageCircle } from "lucide-react";
import Layout from "../../components/Layout";
import { Badge, StatCard, BarRow, ErrorState, Loader, btnPrimary, btnSm } from "../../components/ui";
import { voyageurApi } from "../../api/voyageur";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import {
  cityCode, formatCompactMoney, formatKg, formatMoney, formatNumber, formatTripShortDate, plural, routeLabel,
  shortName, timeAgo,
} from "../../lib/format";
import { paths } from "../../lib/hashid";

// Statistiques + les 3 réservations qui attendent une réponse, en parallèle
function loadDashboard() {
  return Promise.all([
    voyageurApi.getStats(),
    voyageurApi.listReservations({ status: ["PENDING"], limit: 3 }),
  ]).then(([stats, pending]) => ({ stats, pending }));
}

// Revenus : une valeur par devise (on n'additionne pas des € et des F CFA)
function revenueCard(revenue) {
  if (revenue.length === 0) return { value: "0", trend: null };
  if (revenue.length === 1) {
    const [r] = revenue;
    return {
      value: formatCompactMoney(r.amount, r.currency),
      trend: r.thisMonth > 0 ? `+${formatCompactMoney(r.thisMonth, r.currency)} ce mois` : null,
    };
  }
  return { value: revenue.map((r) => formatCompactMoney(r.amount, r.currency)).join(" · "), trend: null };
}

function DashboardContent({ stats, pending, unread }) {
  const { trips, reservations, revenue, upcomingFill } = stats;

  const cards = [
    { label: "Voyages publiés", value: formatNumber(trips.published), trend: `+${trips.publishedThisMonth} ce mois` },
    { label: "Réservations reçues", value: formatNumber(reservations.received), trend: `+${reservations.receivedThisMonth} ce mois` },
    { label: "Kilos vendus", value: formatKg(reservations.kilos), trend: `+${formatKg(reservations.kilosThisMonth)} ce mois` },
    { label: "Revenus estimés", ...revenueCard(revenue) },
  ];

  return (
    <>
      {/* ===== Statistiques ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* ===== Raccourcis vers les pages dédiées ===== */}
      <div className="border border-line-light rounded-2xl bg-white overflow-hidden mt-6">
        <Link
          to="/voyageur/voyages"
          className="flex items-center gap-3 px-4 py-3.5 border-b border-line-light hover:bg-surface transition"
        >
          <Plane size={19} className="text-primary shrink-0" />
          <span className="flex-1 font-semibold text-sm">Mes voyages publiés</span>
          <span className="text-xs text-muted font-bold">{trips.upcoming} à venir</span>
          <ChevronRight size={17} className="text-muted" />
        </Link>
        <Link
          to="/voyageur/reservations?statut=pending"
          className="flex items-center gap-3 px-4 py-3.5 border-b border-line-light hover:bg-surface transition"
        >
          <Package size={19} className="text-primary shrink-0" />
          <span className="flex-1 font-semibold text-sm">Réservations reçues</span>
          {reservations.pending > 0 ? (
            <Badge tone="pending">{reservations.pending} à confirmer</Badge>
          ) : (
            <span className="text-xs text-muted font-bold">À jour</span>
          )}
          <ChevronRight size={17} className="text-muted" />
        </Link>
        <Link to="/messages" className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition">
          <MessageCircle size={19} className="text-primary shrink-0" />
          <span className="flex-1 font-semibold text-sm">Messages</span>
          {unread > 0 ? (
            <Badge tone="pending">{plural(unread, "non lu")}</Badge>
          ) : (
            <span className="text-xs text-muted font-bold">À jour</span>
          )}
          <ChevronRight size={17} className="text-muted" />
        </Link>
      </div>

      {/* ===== Remplissage des prochains vols ===== */}
      <h2 className="text-[17px] font-extrabold mt-6 mb-3">Remplissage de mes prochains voyages</h2>
      <div className="border border-line rounded-2xl p-5 bg-white">
        {upcomingFill.length === 0 ? (
          <p className="text-muted text-sm text-center py-2">
            Aucun voyage à venir.{" "}
            <Link to="/publier" className="font-bold underline text-ink">Publiez-en un</Link>
          </p>
        ) : (
          upcomingFill.map((t) => (
            <BarRow
              key={t.id}
              label={`${cityCode(t.departureCity)} → ${cityCode(t.arrivalCity)} · ${formatTripShortDate(t.departureAt)}`}
              percent={t.kilosTotal > 0 ? (t.kilosReserved / t.kilosTotal) * 100 : 0}
              value={`${t.kilosReserved}/${t.kilosTotal} kg`}
            />
          ))
        )}
      </div>

      {/* ===== À traiter : réservations en attente ===== */}
      <div className="flex justify-between items-center mt-6 mb-3">
        <h2 className="text-[17px] font-extrabold">À confirmer</h2>
        <Link to="/voyageur/reservations?statut=pending" className="text-[13px] font-bold underline">
          Tout voir
        </Link>
      </div>
      <div className="flex flex-col gap-3 pb-8">
        {pending.items.map((r) => (
          <div key={r.id} className="border border-line-light rounded-xl px-4 py-3.5 bg-white flex flex-col gap-2">
            <div className="flex justify-between items-start gap-2.5">
              <div>
                <div className="font-bold text-[14.5px]">
                  {r.clientName}
                  {r.isGuest && <span className="text-muted font-semibold"> (visiteur)</span>} · {formatKg(r.kilos)} ·{" "}
                  {formatMoney(r.totalAmount, r.currency)}
                </div>
                <div className="text-[13px] text-muted">
                  {routeLabel(r.trip)} du {formatTripShortDate(r.trip.departureAt)} · réservé {timeAgo(r.createdAt)}
                </div>
              </div>
              <Badge tone="pending">À confirmer</Badge>
            </div>
            <div className="flex gap-2 flex-wrap mt-1">
              {r.conversationId && (
                <Link to={paths.conversation(r.conversationId)} className={`${btnPrimary} ${btnSm}`}>
                  <MessageCircle size={16} /> Répondre dans la conversation
                  {r.unreadCount > 0 && (
                    <span className="bg-white text-primary rounded-full px-1.5 text-[11px] leading-4.5">{r.unreadCount}</span>
                  )}
                </Link>
              )}
              <Link to="/voyageur/reservations?statut=pending" className="text-[13px] font-bold underline self-center">
                Détails
              </Link>
            </div>
          </div>
        ))}

        {pending.items.length === 0 && (
          <p className="text-muted text-sm text-center py-6">🎉 Rien à confirmer pour le moment.</p>
        )}
      </div>
    </>
  );
}

export default function TravelerDashboard() {
  const { user } = useAuth();
  const unread = useUnreadCount();
  const { data, loading, error, reload } = useApi(loadDashboard, []);

  // Nouvelle réservation ou nouveau message : le tableau de bord se rafraîchit tout seul
  const timer = useRef(null);
  useSocketEvent("inbox:updated", () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, 600);
  });

  return (
    <Layout variant="traveler">
      {/* ===== En-tête ===== */}
      <div className="flex justify-between items-center flex-wrap gap-2.5 mt-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Espace voyageur ✈️</h1>
          <p className="text-muted text-sm">
            {shortName(user.firstName, user.lastName)} · compte approuvé <Badge tone="success">Actif</Badge>
          </p>
        </div>
        <Link to="/publier" className={`${btnPrimary} ${btnSm} px-4.5! py-3!`}>
          <Plus size={16} /> Publier un voyage
        </Link>
      </div>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Loader />}
      {data && <DashboardContent {...data} unread={unread} />}
    </Layout>
  );
}
