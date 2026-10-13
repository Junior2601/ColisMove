import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, History, MessageCircle, Search, X } from "lucide-react";
import Layout from "../../components/Layout";
import ReservationHistory from "../../components/ReservationHistory";
import ReservationStatusModal from "../../components/ReservationStatusModal";
import {
  Badge, ChipRow, ErrorState, FilterChip, LoadMore, Loader, Toast,
  btnDanger, btnOutline, btnPrimary, btnSm,
} from "../../components/ui";
import { voyageurApi } from "../../api/voyageur";
import { usePaginated } from "../../hooks/useApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFlash } from "../../hooks/useFlash";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import { formatKg, formatMoney, formatPhone, formatTripShortDate, routeLabel, timeAgo } from "../../lib/format";
import { CANCELLABLE_RESERVATION_STATUSES, NEXT_RESERVATION_STEP, RESERVATION_STATUS } from "../../lib/status";

// Le filtre actif est dans l'URL (?statut=pending) : le tableau de bord peut y renvoyer directement
const STATUS_FILTERS = [
  { key: "all", label: "Toutes", statuses: undefined },
  { key: "pending", label: "À confirmer", statuses: ["PENDING"] },
  { key: "confirmed", label: "Confirmées", statuses: ["CONFIRMED"] },
  { key: "ongoing", label: "En cours", statuses: ["RECEIVED", "IN_TRANSIT", "ARRIVED"] },
  { key: "delivered", label: "Livrées", statuses: ["DELIVERED"] },
  { key: "cancelled", label: "Annulées", statuses: ["CANCELLED"] },
];

function ReservationCard({ r, onChangeStatus }) {
  const [showHistory, setShowHistory] = useState(false);
  const status = RESERVATION_STATUS[r.status];
  const next = NEXT_RESERVATION_STEP[r.status];
  const canCancel = CANCELLABLE_RESERVATION_STATUSES.includes(r.status);
  const unread = r.unreadCount > 0;

  return (
    <div className="border border-line-light rounded-xl px-4 py-3.5 bg-white flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2.5">
        <div className="min-w-0">
          <div className="font-bold text-[14.5px]">
            {r.clientName}
            {r.isGuest && <span className="text-muted font-semibold"> (visiteur)</span>}
            {" · "}
            {formatKg(r.kilos)} · {formatMoney(r.totalAmount, r.currency)}
          </div>
          <div className="text-[13px] text-muted">
            {routeLabel(r.trip)} du {formatTripShortDate(r.trip.departureAt)} · réservé {timeAgo(r.createdAt)}
          </div>
          <div className="text-[13px] text-muted">📦 {r.parcelDescription || "Colis non décrit"}</div>
          <div className="text-xs text-muted mt-0.5">
            <span className="font-mono font-bold text-ink">{r.trackingCode}</span> · {formatPhone(r.clientPhone)}
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex gap-2 flex-wrap mt-1">
        {/* L'échange avec le client se fait dans la conversation de la réservation */}
        {r.conversationId && (
          <Link to={`/messages/${r.conversationId}`} className={`${unread ? btnPrimary : btnOutline} ${btnSm}`}>
            <MessageCircle size={15} /> Conversation
            {unread && <span className="bg-white text-primary rounded-full px-1.5 text-[11px] leading-4.5">{r.unreadCount}</span>}
          </Link>
        )}
        {/* Action selon l'étape du cycle de vie */}
        {next && (
          <button type="button" onClick={() => onChangeStatus(r, next.status)} className={`${unread ? btnOutline : btnPrimary} ${btnSm}`}>
            <Check size={15} /> {next.action}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className={`${btnOutline} ${btnSm}`}
        >
          <History size={15} /> {showHistory ? "Masquer" : "Historique"}
        </button>
        {canCancel && (
          <button type="button" onClick={() => onChangeStatus(r, "CANCELLED")} className={`${btnDanger} ${btnSm}`}>
            <X size={15} /> Annuler
          </button>
        )}
      </div>

      {showHistory && (
        <ReservationHistory reservationId={r.id} version={r.updatedAt} load={() => voyageurApi.getReservation(r.id)} />
      )}
    </div>
  );
}

export default function MesReservations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tripFilter = searchParams.get("voyage"); // ex. "1" si on vient de Mes voyages
  const statusFilter = STATUS_FILTERS.find((f) => f.key === searchParams.get("statut")) ?? STATUS_FILTERS[0];
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim());
  const [changing, setChanging] = useState(null); // { reservation, nextStatus }
  const [flash, showFlash] = useFlash();

  // Le serveur filtre toujours sur le voyageur connecté : jamais par un paramètre envoyé ici
  const list = usePaginated(
    (page) => voyageurApi.listReservations({ tripId: tripFilter ?? undefined, status: statusFilter.statuses, q, ...page }),
    [tripFilter, statusFilter.key, q]
  );

  // Nouvelle réservation ou nouveau message : la liste se met à jour toute seule (une fois le calme revenu)
  const timer = useRef(null);
  useSocketEvent("inbox:updated", () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(list.reload, 500);
  });

  function setParam(key, value) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  }

  // Libellé du filtre voyage, déduit des réservations chargées
  const filteredTrip = list.items.find((r) => String(r.tripId) === tripFilter)?.trip;
  const tripChipLabel = filteredTrip
    ? `${routeLabel(filteredTrip)} du ${formatTripShortDate(filteredTrip.departureAt)}`
    : `Voyage #${tripFilter}`;

  return (
    <Layout variant="traveler">
      <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Réservations reçues</h1>
      <p className="text-muted text-sm mb-4">
        Les réservations faites sur vos voyages. Échangez avec le client dans la conversation, puis confirmez.
      </p>

      {/* ===== Recherche ===== */}
      <div className="flex items-center gap-2.5 border border-line rounded-full py-2.5 px-5 shadow-card bg-white mb-3">
        <Search size={18} className="text-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Code de suivi ou nom du client…"
          aria-label="Rechercher une réservation"
          className="flex-1 min-w-0 outline-none text-sm font-medium bg-transparent"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="text-muted">
            <X size={16} />
          </button>
        )}
      </div>

      {/* ===== Filtre voyage actif (si ?voyage=...) ===== */}
      {tripFilter && (
        <button
          type="button"
          onClick={() => setParam("voyage", null)}
          className="inline-flex items-center gap-1.5 border border-ink bg-ink text-white rounded-full px-3.5 py-1.5 text-[13px] font-semibold mb-3 hover:opacity-85 transition"
        >
          {tripChipLabel} <X size={14} />
        </button>
      )}

      {/* ===== Filtres par statut ===== */}
      <ChipRow>
        {STATUS_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            active={statusFilter.key === f.key}
            onClick={() => setParam("statut", f.key === "all" ? null : f.key)}
          >
            {f.label}
          </FilterChip>
        ))}
      </ChipRow>

      {/* ===== Liste ===== */}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

      {list.loading && list.items.length === 0 ? (
        <Loader />
      ) : (
        <div className={`transition-opacity ${list.loading ? "opacity-60" : ""}`}>
          <div className="flex flex-col gap-3 pb-6">
            {list.items.map((r) => (
              <ReservationCard
                key={r.id}
                r={r}
                onChangeStatus={(reservation, nextStatus) => setChanging({ reservation, nextStatus })}
              />
            ))}
          </div>

          {!list.loading && !list.error && list.items.length === 0 && (
            <p className="text-muted text-sm text-center py-10">Aucune réservation ne correspond à ces filtres.</p>
          )}

          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </div>
      )}

      {changing && (
        <ReservationStatusModal
          nextStatus={changing.nextStatus}
          summary={`${changing.reservation.clientName} · ${formatKg(changing.reservation.kilos)} · ${routeLabel(changing.reservation.trip)} (${changing.reservation.trackingCode}).`}
          onClose={() => setChanging(null)}
          onConfirm={async (note) => {
            const updated = await voyageurApi.updateReservationStatus(changing.reservation.id, changing.nextStatus, note);
            // On garde le compteur de non-lus déjà affiché (la réponse de l'API ne le contient pas)
            list.setItems((items) => items.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
            setChanging(null);
            showFlash(`${updated.trackingCode} : ${RESERVATION_STATUS[updated.status].label}.`);
          }}
        />
      )}

      <Toast flash={flash} />
    </Layout>
  );
}
