import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Package, Pencil, Plus, Search, X } from "lucide-react";
import Layout from "../../components/Layout";
import { RouteLine } from "../../components/TripCard";
import EditTripModal from "../../components/admin/EditTripModal";
import CancelTripModal from "../../components/CancelTripModal";
import {
  Badge, BarRow, ChipRow, ErrorState, FilterChip, LoadMore, Loader, Toast, btnDanger, btnOutline, btnPrimary, btnSm,
} from "../../components/ui";
import { adminApi } from "../../api/admin";
import { useAuth } from "../../context/AuthContext";
import { usePaginated } from "../../hooks/useApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFlash } from "../../hooks/useFlash";
import { formatMoney, formatTripDate, ownerLabel, plural } from "../../lib/format";
import { tripStatusBadge } from "../../lib/status";
import { paths } from "../../lib/hashid";

const OWNER_FILTERS = [
  { key: "all", label: "Tous" },
  { key: "ADMIN", label: "MoveColis" },
  { key: "VOYAGEUR", label: "Voyageurs" },
];

function AdminTripCard({ trip, isMine, onSelectOwner, onEdit, onCancel }) {
  const percent = trip.kilosTotal > 0 ? (trip.kilosReserved / trip.kilosTotal) * 100 : 0;
  const finished = trip.status !== "PUBLISHED" || trip.hasDeparted;
  const status = tripStatusBadge(trip);
  const isAdminTrip = trip.owner.role === "ADMIN";

  // L'admin ne modifie que SES voyages ; il peut annuler n'importe quel voyage publié (modération)
  const canEdit = isMine && trip.status === "PUBLISHED" && !trip.hasDeparted;
  const canCancel = trip.status === "PUBLISHED";

  return (
    <div className="border border-line-light rounded-2xl bg-white p-4 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2">
        <span className="text-[13px] text-muted font-semibold">
          {formatTripDate(trip.departureAt)} · {formatMoney(trip.pricePerKilo, trip.currency)}/kg
        </span>
        <div className="flex items-center gap-1.5">
          {/* Propriétaire du voyage — cliquer sur un voyageur filtre ses voyages */}
          {isAdminTrip ? (
            <Badge tone="info">MoveColis</Badge>
          ) : (
            <button type="button" onClick={() => onSelectOwner(trip.owner)} title="Voir tous ses voyages">
              <Badge tone="pending">{ownerLabel(trip.owner)}</Badge>
            </button>
          )}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <RouteLine trip={trip} />

      <BarRow
        label={finished ? "Vendu" : "Réservé"}
        percent={percent}
        value={`${trip.kilosReserved}/${trip.kilosTotal} kg`}
      />

      <div className="flex gap-2 flex-wrap mt-1">
        <Link to={paths.tripReservations("/admin/reservations", trip.id)} className={`${btnOutline} ${btnSm}`}>
          <Package size={15} /> Réservations ({trip.reservationsCount})
          {trip.pendingReservationsCount > 0 && (
            <span className="bg-primary text-white rounded-full px-1.5 text-[11px] leading-4.5">
              {trip.pendingReservationsCount}
            </span>
          )}
        </Link>
        {canEdit && (
          <button type="button" onClick={() => onEdit(trip)} className={`${btnOutline} ${btnSm}`}>
            <Pencil size={15} /> Modifier
          </button>
        )}
        {canCancel && (
          <button type="button" onClick={() => onCancel(trip)} className={`${btnDanger} ${btnSm}`}>
            <Ban size={15} /> Annuler
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminVoyages() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim());
  const [ownerRole, setOwnerRole] = useState("all");
  const [selectedOwner, setSelectedOwner] = useState(null); // { id, label }
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [flash, showFlash] = useFlash();

  const trips = usePaginated(
    (page) =>
      adminApi.listTrips({
        q,
        ownerRole: ownerRole === "all" ? undefined : ownerRole,
        ownerId: selectedOwner?.id,
        ...page,
      }),
    [q, ownerRole, selectedOwner?.id]
  );

  function selectRole(role) {
    setSelectedOwner(null);
    setOwnerRole(role);
  }

  function selectOwner(owner) {
    setOwnerRole("all");
    setSelectedOwner({ id: owner.id, label: ownerLabel(owner) });
  }

  // Met à jour un voyage dans la liste en gardant propriétaire et compteurs
  function patchTrip(id, changes) {
    trips.setItems((items) => items.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  }

  return (
    <Layout variant="admin">
      {/* ===== En-tête ===== */}
      <div className="flex justify-between items-center flex-wrap gap-2.5 mt-5 mb-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Tous les voyages</h1>
        <Link to="/publier" className={`${btnPrimary} ${btnSm} px-4.5! py-3!`}>
          <Plus size={16} /> Créer un voyage
        </Link>
      </div>
      <p className="text-muted text-sm mb-4">
        Les voyages publiés par vous et par les voyageurs de la plateforme.
      </p>

      {/* ===== Recherche (côté serveur, après 300 ms sans frappe) ===== */}
      <div className="flex items-center gap-2.5 border border-line rounded-full py-2.5 px-5 shadow-card bg-white mb-3">
        <Search size={18} className="text-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par ville (départ, escale, arrivée)…"
          aria-label="Rechercher un voyage"
          className="flex-1 min-w-0 outline-none text-sm font-medium bg-transparent"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="text-muted">
            <X size={16} />
          </button>
        )}
      </div>

      {/* ===== Filtre par propriétaire ===== */}
      <ChipRow>
        {OWNER_FILTERS.map((f) => (
          <FilterChip key={f.key} active={!selectedOwner && ownerRole === f.key} onClick={() => selectRole(f.key)}>
            {f.label}
          </FilterChip>
        ))}
        {selectedOwner && (
          <FilterChip active onClick={() => setSelectedOwner(null)}>
            {selectedOwner.label} <X size={14} />
          </FilterChip>
        )}
      </ChipRow>

      {/* ===== Liste ===== */}
      {trips.error && <ErrorState error={trips.error} onRetry={trips.reload} />}

      {trips.loading && trips.items.length === 0 ? (
        <Loader />
      ) : (
        <div className={`transition-opacity ${trips.loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6">
            {trips.items.map((t) => (
              <AdminTripCard
                key={t.id}
                trip={t}
                isMine={t.ownerId === user.id}
                onSelectOwner={selectOwner}
                onEdit={setEditing}
                onCancel={setCancelling}
              />
            ))}
          </div>

          {!trips.loading && !trips.error && trips.items.length === 0 && (
            <p className="text-muted text-sm text-center py-10">Aucun voyage ne correspond à ces filtres.</p>
          )}

          <LoadMore hasMore={trips.hasMore} loading={trips.loadingMore} onClick={trips.loadMore} />
        </div>
      )}

      {/* ===== Modales ===== */}
      {editing && (
        <EditTripModal
          trip={editing}
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
            const { trip, cancelledReservations } = await adminApi.cancelTrip(cancelling.id, reason);
            patchTrip(trip.id, { ...trip, reservationsCount: 0, pendingReservationsCount: 0 });
            setCancelling(null);
            showFlash(`Voyage annulé · ${plural(cancelledReservations, "réservation")} annulée${cancelledReservations > 1 ? "s" : ""}.`);
          }}
        />
      )}

      <Toast flash={flash} />
    </Layout>
  );
}
