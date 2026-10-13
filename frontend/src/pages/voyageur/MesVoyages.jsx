import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Plus, Pencil, Trash2, Package } from "lucide-react";
import Layout from "../../components/Layout";
import { RouteLine } from "../../components/TripCard";
import EditTripModal from "../../components/admin/EditTripModal";
import CancelTripModal from "../../components/CancelTripModal";
import {
  Badge, BarRow, ErrorState, LoadMore, Loader, Modal, Toast, btnDanger, btnOutline, btnPrimary, btnSm,
} from "../../components/ui";
import { voyageurApi } from "../../api/voyageur";
import { errorMessage } from "../../api/client";
import { usePaginated } from "../../hooks/useApi";
import { useFlash } from "../../hooks/useFlash";
import { formatMoney, formatTripDate, plural, routeLabel } from "../../lib/format";
import { tripStatusBadge } from "../../lib/status";

const TABS = [
  { key: "upcoming", label: "À venir" },
  { key: "past", label: "Terminés" },
];

function MyTripCard({ trip, onEdit, onCancel, onDelete }) {
  const percent = trip.kilosTotal > 0 ? (trip.kilosReserved / trip.kilosTotal) * 100 : 0;
  const status = tripStatusBadge(trip);
  const active = trip.status === "PUBLISHED" && !trip.hasDeparted;

  return (
    <div className="border border-line-light rounded-2xl bg-white p-4 flex flex-col gap-2">
      {/* En-tête : date + badge */}
      <div className="flex justify-between items-center gap-2">
        <span className="text-[13px] text-muted font-semibold">
          {formatTripDate(trip.departureAt)} · {formatMoney(trip.pricePerKilo, trip.currency)}/kg
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {/* Route de vol réutilisée */}
      <RouteLine trip={trip} />

      {/* Remplissage */}
      <BarRow
        label={active ? "Réservé" : "Vendu"}
        percent={percent}
        value={`${trip.kilosReserved}/${trip.kilosTotal} kg`}
      />
      {trip.revenue > 0 && (
        <div className="text-[13px] font-bold text-success">
          {formatMoney(trip.revenue, trip.currency)} de réservations
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap mt-1">
        <Link to={`/voyageur/reservations?voyage=${trip.id}`} className={`${btnOutline} ${btnSm}`}>
          <Package size={15} /> Réservations ({trip.reservationsCount})
          {trip.pendingReservationsCount > 0 && (
            <span className="bg-primary text-white rounded-full px-1.5 text-[11px] leading-4.5">
              {trip.pendingReservationsCount}
            </span>
          )}
        </Link>
        {active && (
          <button type="button" onClick={() => onEdit(trip)} className={`${btnOutline} ${btnSm}`}>
            <Pencil size={15} /> Modifier
          </button>
        )}
        {/* Sans réservation : on supprime. Avec réservations : on annule (les clients sont prévenus). */}
        {active && trip.reservationsCount === 0 && (
          <button type="button" onClick={() => onDelete(trip)} className={`${btnDanger} ${btnSm}`}>
            <Trash2 size={15} /> Supprimer
          </button>
        )}
        {trip.status === "PUBLISHED" && trip.reservationsCount > 0 && (
          <button type="button" onClick={() => onCancel(trip)} className={`${btnDanger} ${btnSm}`}>
            <Ban size={15} /> Annuler le voyage
          </button>
        )}
      </div>
    </div>
  );
}

function DeleteTripModal({ trip, onClose, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      onDeleted(await voyageurApi.deleteTrip(trip.id));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal open title="Supprimer ce voyage" onClose={submitting ? undefined : onClose}>
      <p className="text-sm text-muted mb-4">
        {routeLabel(trip)} · {formatTripDate(trip.departureAt)}. Le voyage disparaîtra de la liste proposée aux
        clients. Cette action est définitive.
      </p>
      {error && <ErrorState message={error} />}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={submitting} className={`${btnOutline} ${btnSm}`}>
          Retour
        </button>
        <button type="button" onClick={handleConfirm} disabled={submitting} className={`${btnDanger} ${btnSm}`}>
          {submitting ? "Suppression…" : "Supprimer"}
        </button>
      </div>
    </Modal>
  );
}

export default function MesVoyages() {
  const [tab, setTab] = useState("upcoming");
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [flash, showFlash] = useFlash();

  const trips = usePaginated((page) => voyageurApi.listTrips({ period: tab, ...page }), [tab]);
  const counts = trips.meta?.counts;

  // Met à jour un voyage dans la liste en gardant les compteurs de réservations
  function patchTrip(id, changes) {
    trips.setItems((items) => items.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  }

  return (
    <Layout variant="traveler">
      {/* ===== En-tête ===== */}
      <div className="flex justify-between items-center flex-wrap gap-2.5 mt-5 mb-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Mes voyages</h1>
        <Link to="/publier" className={`${btnPrimary} ${btnSm} px-4.5! py-3!`}>
          <Plus size={16} /> Publier un voyage
        </Link>
      </div>
      <p className="text-muted text-sm mb-4">Gérez vos voyages publiés et suivez leur remplissage.</p>

      {/* ===== Onglets ===== */}
      <div className="flex gap-1 border-b border-line-light mb-4" role="tablist">
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
            {counts && ` (${counts[t.key]})`}
          </button>
        ))}
      </div>

      {/* ===== Liste ===== */}
      {trips.error && <ErrorState error={trips.error} onRetry={trips.reload} />}

      {trips.loading && trips.items.length === 0 ? (
        <Loader />
      ) : (
        <div className={`transition-opacity ${trips.loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6">
            {trips.items.map((t) => (
              <MyTripCard key={t.id} trip={t} onEdit={setEditing} onCancel={setCancelling} onDelete={setDeleting} />
            ))}
          </div>

          {/* État vide */}
          {!trips.loading && !trips.error && trips.items.length === 0 && (
            <div className="text-center py-10 text-muted text-sm">
              Aucun voyage ici pour l'instant.{" "}
              <Link to="/publier" className="font-bold underline text-ink">Publiez votre premier voyage</Link>
            </div>
          )}

          <LoadMore hasMore={trips.hasMore} loading={trips.loadingMore} onClick={trips.loadMore} />
        </div>
      )}

      {/* ===== Modales ===== */}
      {editing && (
        <EditTripModal
          trip={editing}
          save={voyageurApi.updateTrip}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            patchTrip(updated.id, updated);
            setEditing(null);
            showFlash("Voyage modifié.");
          }}
        />
      )}

      {cancelling && (
        <CancelTripModal
          trip={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            const { trip, cancelledReservations } = await voyageurApi.cancelTrip(cancelling.id, reason);
            patchTrip(trip.id, { ...trip, reservationsCount: 0, pendingReservationsCount: 0 });
            setCancelling(null);
            showFlash(`Voyage annulé · ${plural(cancelledReservations, "client")} prévenu${cancelledReservations > 1 ? "s" : ""}.`);
          }}
        />
      )}

      {deleting && (
        <DeleteTripModal
          trip={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(result) => {
            if (result.deleted) {
              trips.setItems((items) => items.filter((t) => t.id !== deleting.id));
              trips.setTotal((total) => total - 1);
              trips.setMeta((meta) => ({ ...meta, counts: { ...meta.counts, [tab]: meta.counts[tab] - 1 } }));
            } else {
              patchTrip(result.trip.id, result.trip); // gardé comme "annulé" (réservations annulées à conserver)
            }
            setDeleting(null);
            showFlash(result.deleted ? "Voyage supprimé." : "Voyage retiré de la vente.");
          }}
        />
      )}

      <Toast flash={flash} />
    </Layout>
  );
}
