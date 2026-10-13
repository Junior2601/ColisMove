import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, History, MessageCircle, Search, X } from "lucide-react";
import Layout from "../../components/Layout";
import {
  Badge, ChipRow, ErrorState, Field, FilterChip, LoadMore, Loader, Modal, Toast,
  btnDanger, btnOutline, btnPrimary, btnSm, inputClass,
} from "../../components/ui";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { useApi, usePaginated } from "../../hooks/useApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFlash } from "../../hooks/useFlash";
import {
  formatDateTime, formatKg, formatMoney, formatTripShortDate, ownerLabel, routeLabel, timeAgo,
} from "../../lib/format";
import { decodeId, paths } from "../../lib/hashid";
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

// Exemples de notes selon l'étape (le client les verra dans son suivi)
const NOTE_PLACEHOLDERS = {
  CONFIRMED: "Ex. Remise du colis samedi à Cocody",
  RECEIVED: "Ex. Colis pesé : 5 kg",
  IN_TRANSIT: "Ex. Escale à Istanbul",
  ARRIVED: "Ex. Arrivé à Moscou",
  DELIVERED: "Ex. Remis au destinataire",
  CANCELLED: "Ex. Client injoignable",
};

/* ===== Historique de suivi d'une réservation (chargé à l'ouverture) ===== */
function ReservationHistory({ reservationId, version }) {
  // `version` (updatedAt) change après chaque mise à jour → l'historique se recharge
  const { data, loading, error, reload } = useApi(() => adminApi.getReservation(reservationId), [reservationId, version]);

  if (loading && !data) return <Loader className="py-3!" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <ol className="border-l-2 border-line-light ml-1.5 mt-1 pl-4 flex flex-col gap-2.5">
      {data.history.map((event) => (
        <li key={event.id} className="relative text-[13px]">
          <span className="absolute -left-[22px] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
          <div className="font-bold">
            {RESERVATION_STATUS[event.status].label}
            {event.note && <span className="font-normal text-muted"> — {event.note}</span>}
          </div>
          <div className="text-xs text-muted">
            {formatDateTime(event.createdAt)}
            {event.createdByName && ` · par ${event.createdByName}`}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ===== Confirmation d'un changement de statut (avec note facultative) ===== */
function StatusChangeModal({ reservation, nextStatus, onClose, onDone }) {
  const cancelling = nextStatus === "CANCELLED";
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await adminApi.updateReservationStatus(reservation.id, nextStatus, note.trim() || undefined);
      onDone(updated);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      title={cancelling ? "Annuler la réservation" : `Passer à « ${RESERVATION_STATUS[nextStatus].label} »`}
      onClose={submitting ? undefined : onClose}
    >
      <p className="text-sm text-muted mb-4">
        <b className="text-ink">{reservation.clientName}</b> · {formatKg(reservation.kilos)} ·{" "}
        {routeLabel(reservation.trip)} ({reservation.trackingCode}).{" "}
        {cancelling
          ? `Les ${formatKg(reservation.kilos)} seront remis en vente sur le voyage. Action définitive.`
          : "Le client verra cette étape dans son suivi."}
      </p>

      <Field label="Note (facultative)">
        <input
          value={note}
          maxLength={255}
          onChange={(e) => setNote(e.target.value)}
          placeholder={NOTE_PLACEHOLDERS[nextStatus]}
          className={inputClass}
        />
      </Field>

      {error && <ErrorState message={error} />}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={submitting} className={`${btnOutline} ${btnSm}`}>
          Retour
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={`${cancelling ? btnDanger : btnPrimary} ${btnSm}`}
        >
          {submitting ? "Enregistrement…" : cancelling ? "Annuler la réservation" : "Confirmer"}
        </button>
      </div>
    </Modal>
  );
}

/* ===== Carte réservation ===== */
function AdminReservationCard({ r, onChangeStatus }) {
  const [showHistory, setShowHistory] = useState(false);
  const status = RESERVATION_STATUS[r.status];
  const next = NEXT_RESERVATION_STEP[r.status];
  const canCancel = CANCELLABLE_RESERVATION_STATUSES.includes(r.status);

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
          {/* Le propriétaire en gras : l'info que seul l'admin voit */}
          <div className="text-[13px] text-muted">
            {routeLabel(r.trip)} du {formatTripShortDate(r.trip.departureAt)} · voyage de{" "}
            <b className="text-ink">{ownerLabel(r.trip.owner)}</b>
          </div>
          <div className="text-[13px] text-muted">
            📦 {r.parcelDescription || "Colis non décrit"} · réservé {timeAgo(r.createdAt)}
          </div>
          <div className="text-xs text-muted mt-0.5">
            <span className="font-mono font-bold text-ink">{r.trackingCode}</span> · +{r.clientPhone}
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex gap-2 flex-wrap mt-1">
        {next && (
          <button type="button" onClick={() => onChangeStatus(r, next.status)} className={`${btnPrimary} ${btnSm}`}>
            <Check size={15} /> {next.action}
          </button>
        )}
        {r.conversationId && (
          <Link to={paths.conversation(r.conversationId)} className={`${btnOutline} ${btnSm}`}>
            <MessageCircle size={15} /> Conversation
          </Link>
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

      {showHistory && <ReservationHistory reservationId={r.id} version={r.updatedAt} />}
    </div>
  );
}

export default function AdminReservations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tripFilter = decodeId(searchParams.get("voyage")); // ?voyage=Xk9mP2qA → 12
  const statusFilter = STATUS_FILTERS.find((f) => f.key === searchParams.get("statut")) ?? STATUS_FILTERS[0];
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim());
  const [changing, setChanging] = useState(null); // { reservation, nextStatus }
  const [flash, showFlash] = useFlash();

  const list = usePaginated(
    (page) =>
      adminApi.listReservations({
        tripId: tripFilter ?? undefined,
        status: statusFilter.statuses,
        q,
        ...page,
      }),
    [tripFilter, statusFilter.key, q]
  );

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
  const filteredTrip = list.items.find((r) => r.tripId === tripFilter)?.trip;
  const tripChipLabel = filteredTrip
    ? `${routeLabel(filteredTrip)} du ${formatTripShortDate(filteredTrip.departureAt)}`
    : "Voyage sélectionné";

  function handleStatusChanged(updated) {
    list.setItems((items) => items.map((r) => (r.id === updated.id ? updated : r)));
    setChanging(null);
    showFlash(`${updated.trackingCode} : ${RESERVATION_STATUS[updated.status].label}.`);
  }

  return (
    <Layout variant="admin">
      <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Réservations de la plateforme</h1>
      <p className="text-muted text-sm mb-4">Toutes les réservations — vos voyages et ceux des voyageurs.</p>

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
              <AdminReservationCard
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
        <StatusChangeModal
          reservation={changing.reservation}
          nextStatus={changing.nextStatus}
          onClose={() => setChanging(null)}
          onDone={handleStatusChanged}
        />
      )}

      <Toast flash={flash} />
    </Layout>
  );
}
