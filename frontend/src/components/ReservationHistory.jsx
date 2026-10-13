import { ErrorState, Loader } from "./ui";
import { useApi } from "../hooks/useApi";
import { formatDateTime } from "../lib/format";
import { RESERVATION_STATUS } from "../lib/status";

/**
 * Historique de suivi d'une réservation (chargé à l'ouverture).
 * load() : appel API qui renvoie la réservation avec son champ history.
 * version (ex. updatedAt) : quand elle change, l'historique se recharge.
 */
export default function ReservationHistory({ reservationId, load, version }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { data, loading, error, reload } = useApi(load, [reservationId, version]);

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
