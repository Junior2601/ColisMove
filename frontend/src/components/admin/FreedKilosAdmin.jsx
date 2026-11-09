import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, MessageCircle, PackagePlus } from "lucide-react";
import { Badge, ChipRow, ErrorState, FilterChip, Loader, Notice, btnOutline, btnPrimary, btnSm } from "../ui";
import { adminApi } from "../../api/admin";
import { useApi } from "../../hooks/useApi";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import { formatKg, formatMoney, formatTripDate, formatTripTime } from "../../lib/format";
import { arrivalTimeLabel, formatDuration, removedBagsLabel, stopsLabel } from "../../lib/flights";
import { encodeId, paths } from "../../lib/hashid";
import { FLIGHT_ORDER_STATUS } from "../../lib/status";

// État des kilos d'une demande (calculé par le serveur)
const KILOS_STATE = {
  AVAILABLE: { label: "À publier", tone: "success" },
  WAITING_PAYMENT: { label: "Billet pas encore payé", tone: "pending" },
  PUBLISHED: { label: "Publiés", tone: "info" },
  CANCELLED: { label: "Billet annulé", tone: "danger" },
};

const PERIODS = [
  { key: "upcoming", label: "Vols à venir" },
  { key: "past", label: "Vols passés" },
];

function SummaryTile({ label, kilos }) {
  return (
    <div className="border border-line-light rounded-xl p-3.5 bg-white">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-extrabold">{formatKg(kilos)}</div>
    </div>
  );
}

function KilosCard({ item }) {
  const { flight, bags, trip } = item;
  const state = KILOS_STATE[item.kilosState];
  const canPublish = item.kilosState === "AVAILABLE" && !item.hasDeparted;
  const tripStillOnline = trip && trip.status === "PUBLISHED";

  return (
    <div className="border border-line-light rounded-2xl bg-white p-4">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="font-extrabold text-[15px]">
            {flight.origin.name} → {flight.destination.name} · {formatTripDate(flight.departureAt)} ·{" "}
            {formatTripTime(flight.departureAt)}
            {flight.arrivalAt && ` → ${arrivalTimeLabel(flight.departureAt, flight.arrivalAt)}`}
          </div>
          <div className="text-xs text-muted">
            {[
              `${flight.airlineName ?? ""} ${flight.airline} ${flight.flightNumber}`.trim(),
              stopsLabel(flight.transfers, flight.stops),
              flight.durationMinutes && `${formatDuration(flight.durationMinutes)} de trajet`,
            ].filter(Boolean).join(" · ")}
          </div>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      <div className="flex items-baseline gap-2 mt-2.5">
        <span className="text-2xl font-extrabold">{formatKg(bags.freedKilos)}</span>
        <span className="text-[13px] text-muted">
          {removedBagsLabel(bags.removed)} de {flight.checkedBagKg} kg
        </span>
      </div>
      <div className="text-[13px] text-muted mt-0.5">
        Billet de <b className="text-ink">{item.clientName}</b> ·{" "}
        <span className="font-mono font-bold text-ink">{item.reference}</span> · {FLIGHT_ORDER_STATUS[item.status].label}
      </div>

      {trip && (
        <div className="text-[13px] mt-1">
          {trip.status === "CANCELLED" ? (
            <span className="text-muted">Voyage publié puis annulé : ces kilos peuvent être publiés à nouveau.</span>
          ) : (
            <span>
              Voyage en ligne : <b>{formatKg(trip.kilosReserved)}</b> réservés sur {formatKg(trip.kilosTotal)} à{" "}
              {formatMoney(trip.pricePerKilo, trip.currency)}/kg
            </span>
          )}
        </div>
      )}
      {item.kilosState === "WAITING_PAYMENT" && (
        <p className="text-xs text-muted mt-1">Publiables dès que le paiement du billet est enregistré.</p>
      )}
      {item.kilosState === "CANCELLED" && tripStillOnline && (
        <Notice tone="warn">Le billet est annulé mais ses kilos sont encore en vente : pensez à annuler le voyage.</Notice>
      )}

      <div className="flex gap-2 flex-wrap mt-3">
        {canPublish && (
          <Link to={`/publier?billet=${encodeId(item.id)}`} className={`${btnPrimary} ${btnSm}`}>
            <PackagePlus size={15} /> Publier ces kilos
          </Link>
        )}
        {tripStillOnline && (
          <Link to={paths.trip(trip.id)} className={`${btnOutline} ${btnSm}`}>
            <ExternalLink size={15} /> Voir le voyage
          </Link>
        )}
        {item.conversationId && (
          <Link to={paths.conversation(item.conversationId)} className={`${btnOutline} ${btnSm}`}>
            <MessageCircle size={15} /> Conversation
          </Link>
        )}
      </div>
    </div>
  );
}

/* ===== Onglet « Kilos disponibles » : valises retirées par les clients, à revendre ===== */
export default function FreedKilosAdmin() {
  const [period, setPeriod] = useState("upcoming");
  const kilos = useApi(() => adminApi.listFreedKilos({ period }), [period]);

  // Nouvelle demande, paiement, annulation ou voyage publié : on rafraîchit, une fois le calme revenu
  const timer = useRef(null);
  useSocketEvent("flight-orders:updated", () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(kilos.reload, 500);
  });

  const data = kilos.data;

  return (
    <>
      <p className="text-sm text-muted mb-3">
        Quand un client garde moins de valises que celles incluses dans son billet, les kilos libérés arrivent ici. Une
        fois le billet payé, publiez-les comme un voyage MoveColis : les clients sont prévenus.
      </p>

      <ChipRow>
        {PERIODS.map((p) => (
          <FilterChip key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
            {p.label}
          </FilterChip>
        ))}
      </ChipRow>

      {kilos.error && <ErrorState error={kilos.error} onRetry={kilos.reload} />}
      {kilos.loading && !data ? (
        <Loader />
      ) : (
        data && (
          <div className={`pb-6 transition-opacity ${kilos.loading ? "opacity-60" : ""}`}>
            {period === "upcoming" && (
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                <SummaryTile label="À publier" kilos={data.summary.available} />
                <SummaryTile label="Billets pas encore payés" kilos={data.summary.waiting} />
                <SummaryTile label="Déjà en vente" kilos={data.summary.published} />
              </div>
            )}
            {data.items.length === 0 ? (
              <p className="text-center text-muted text-sm py-10">
                {period === "upcoming"
                  ? "Aucun kilo libéré pour l'instant. Ils apparaissent ici dès qu'un client retire une valise de son billet."
                  : "Aucun vol passé avec des kilos libérés."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {data.items.map((item) => (
                  <KilosCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        )
      )}
    </>
  );
}
