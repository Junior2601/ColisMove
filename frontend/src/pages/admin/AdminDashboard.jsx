import { Link } from "react-router-dom";
import { Plus, Plane, Package, UserCheck, Settings, ChevronRight, Megaphone } from "lucide-react";
import Layout from "../../components/Layout";
import { Badge, StatCard, BarRow, ErrorState, Loader, btnPrimary, btnSm } from "../../components/ui";
import { adminApi } from "../../api/admin";
import { useApi } from "../../hooks/useApi";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import {
  formatCompactMoney, formatKg, formatNumber, formatTrend, fullName, plural, timeAgo,
} from "../../lib/format";

// Les 3 appels partent en parallèle
function loadDashboard() {
  return Promise.all([
    adminApi.getStats(),
    adminApi.getActorStats(),
    adminApi.listTravelers({ status: "PENDING", limit: 3 }),
  ]).then(([stats, actors, pendingTravelers]) => ({ stats, actors, pendingTravelers }));
}

// Volume : une valeur par devise (on n'additionne pas des F CFA et des €)
function volumeCard(volume) {
  if (volume.length === 0) return { value: "0", trendPercent: null };
  if (volume.length === 1) {
    return { value: formatCompactMoney(volume[0].last30Days, volume[0].currency), trendPercent: volume[0].trendPercent };
  }
  return { value: volume.map((v) => formatCompactMoney(v.last30Days, v.currency)).join(" · "), trendPercent: null };
}

function buildStatCards({ trips, reservations, kilos, volume }) {
  return [
    { label: "Voyages actifs", value: formatNumber(trips.active), trend: `+${trips.createdLast7Days} cette semaine` },
    { label: "Réservations (30 j)", value: formatNumber(reservations.last30Days), trendPercent: reservations.trendPercent },
    { label: "Kilos réservés (30 j)", value: formatKg(kilos.last30Days), trendPercent: kilos.trendPercent },
    { label: "Volume estimé (30 j)", ...volumeCard(volume) },
  ].map(({ trendPercent, ...card }) => ({
    ...card,
    trend: card.trend ?? formatTrend(trendPercent),
    trendDown: trendPercent < 0,
  }));
}

// Raccourcis vers les pages admin, avec les compteurs à traiter
function buildShortcuts({ trips, pending }) {
  return [
    { to: "/admin/voyages", icon: Plane, label: "Tous les voyages", meta: plural(trips.active, "actif") },
    {
      to: "/admin/reservations?statut=pending",
      icon: Package,
      label: "Réservations de la plateforme",
      meta: pending.reservations > 0 ? `${pending.reservations} à confirmer` : "À jour",
      pending: pending.reservations > 0,
    },
    {
      to: "/admin/approbations",
      icon: UserCheck,
      label: "Approbations voyageurs",
      meta: pending.travelers > 0 ? `${pending.travelers} en attente` : "À jour",
      pending: pending.travelers > 0,
    },
    { to: "/admin/campagnes", icon: Megaphone, label: "Campagnes et notifications", meta: null },
    { to: "/admin/parametres", icon: Settings, label: "Paramètres de messagerie", meta: null },
  ];
}

export default function AdminDashboard() {
  const { data, loading, error, reload } = useApi(loadDashboard, []);
  // Nouvelle demande de compte voyageur : le tableau de bord se rafraîchit tout seul
  useSocketEvent("travelers:pending", reload);

  return (
    <Layout variant="admin">
      {/* ===== En-tête ===== */}
      <div className="flex justify-between items-center flex-wrap gap-2.5 mt-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Administration</h1>
          <p className="text-muted text-sm">Vue globale de la plateforme.</p>
        </div>
        <Link to="/publier" className={`${btnPrimary} ${btnSm} px-4.5! py-3!`}>
          <Plus size={16} /> Créer un voyage
        </Link>
      </div>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Loader />}
      {data && <DashboardContent {...data} />}
    </Layout>
  );
}

function DashboardContent({ stats, actors, pendingTravelers }) {
  const actorRows = [
    { label: "Clients", value: actors.clients },
    { label: "Voyageurs", value: actors.travelers.APPROVED },
    { label: "Visiteurs (30 j)", value: actors.guestsLast30Days, color: "bg-[#4A90D9]" },
  ];
  const maxActors = Math.max(1, ...actorRows.map((row) => row.value));
  const maxRouteKilos = Math.max(1, ...stats.topRoutes.map((route) => route.kilos));

  return (
    <>
      {/* ===== Stats globales ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {buildStatCards(stats).map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* ===== Raccourcis vers les pages admin ===== */}
      <div className="border border-line-light rounded-2xl bg-white overflow-hidden mt-6">
        {buildShortcuts(stats).map(({ to, icon: Icon, label, meta, pending }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 px-4 py-3.5 border-b border-line-light last:border-0 hover:bg-surface transition"
          >
            <Icon size={19} className="text-primary shrink-0" />
            <span className="flex-1 font-semibold text-sm">{label}</span>
            {meta &&
              (pending ? (
                <Badge tone="pending">{meta}</Badge>
              ) : (
                <span className="text-xs text-muted font-bold">{meta}</span>
              ))}
            <ChevronRight size={17} className="text-muted" />
          </Link>
        ))}
      </div>

      {/* ===== Stats des acteurs ===== */}
      <h2 className="text-[17px] font-extrabold mt-6 mb-3">Acteurs de la plateforme</h2>
      <div className="border border-line rounded-2xl p-5 bg-white">
        {actorRows.map((row) => (
          <BarRow
            key={row.label}
            label={row.label}
            percent={(row.value / maxActors) * 100}
            value={formatNumber(row.value)}
            color={row.color}
          />
        ))}
        <p className="text-xs text-muted mt-3">
          {plural(actors.newClientsLast30Days, "nouveau client")} sur 30 jours · Visiteurs = numéros
          distincts ayant réservé sans compte.
        </p>
      </div>

      {/* ===== Trajets les plus demandés ===== */}
      <h2 className="text-[17px] font-extrabold mt-6 mb-3">Trajets les plus demandés (30 j)</h2>
      <div className="border border-line rounded-2xl p-5 bg-white">
        {stats.topRoutes.length === 0 ? (
          <p className="text-muted text-sm text-center py-2">Aucune réservation sur les 30 derniers jours.</p>
        ) : (
          stats.topRoutes.map((route) => (
            <BarRow
              key={`${route.departureCity}-${route.arrivalCity}`}
              label={`${route.departureCity} → ${route.arrivalCity}`}
              percent={(route.kilos / maxRouteKilos) * 100}
              value={formatKg(route.kilos)}
            />
          ))
        )}
        <p className="text-xs text-muted mt-3">
          Remplissage des voyages actifs : <b className="text-ink">{stats.trips.fillRatePercent} %</b>
        </p>
      </div>

      {/* ===== À traiter : demandes voyageur en attente ===== */}
      <div className="flex justify-between items-center mt-6 mb-3">
        <h2 className="text-[17px] font-extrabold">Demandes en attente</h2>
        <Link to="/admin/approbations" className="text-[13px] font-bold underline">
          Tout voir
        </Link>
      </div>
      <div className="flex flex-col gap-3 pb-8">
        {pendingTravelers.items.map((t) => (
          <Link
            key={t.id}
            to="/admin/approbations"
            className="border border-line-light rounded-xl px-4 py-3.5 bg-white flex justify-between items-center gap-2.5 hover:bg-surface transition"
          >
            <div>
              <div className="font-bold text-[14.5px]">{fullName(t)}</div>
              <div className="text-[13px] text-muted">
                {t.city ?? "Ville non renseignée"} · inscription {timeAgo(t.createdAt)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="pending">En attente</Badge>
              <ChevronRight size={17} className="text-muted" />
            </div>
          </Link>
        ))}

        {pendingTravelers.items.length === 0 && (
          <p className="text-muted text-sm text-center py-6">🎉 Aucune demande en attente.</p>
        )}
      </div>
    </>
  );
}
