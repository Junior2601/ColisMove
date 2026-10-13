import { Link } from "react-router-dom";
import { Plane } from "lucide-react";
import {
  cityCode, coverClassFor, formatKg, formatMoney, formatTripDate, formatTripTime, ownerLabel,
} from "../lib/format";
import { paths } from "../lib/hashid";

/**
 * Élément signature du design : la route de vol.
 * Départ → ligne pointillée avec avion au centre → arrivée.
 * L'escale (ou "Vol direct") s'affiche sous la ligne.
 * compact=true affiche les codes aéroport (ABJ) au lieu des villes.
 *
 * Reçoit un voyage de l'API (departureAt, arrivalAt en heure locale).
 * Les champs déjà calculés (departureCode, departureTime…) restent acceptés
 * pour les pages voyageur encore sur données fictives, en attendant leur branchement.
 */
export function RouteLine({ trip, compact = false }) {
  const departureCode = trip.departureCode ?? cityCode(trip.departureCity);
  const arrivalCode = trip.arrivalCode ?? cityCode(trip.arrivalCity);
  const departureTime = trip.departureTime ?? (trip.departureAt && formatTripTime(trip.departureAt));
  const arrivalTime = trip.arrivalTime ?? (trip.arrivalAt && formatTripTime(trip.arrivalAt));

  return (
    <div className="flex items-center gap-2 my-1 mb-2.5">
      {/* Point de départ */}
      <div className="text-center min-w-14">
        <div className="font-bold text-sm">{compact ? departureCode : trip.departureCity}</div>
        <div className="text-xs text-muted">{departureTime}</div>
      </div>

      {/* Ligne pointillée + avion + escale */}
      <div className="relative flex-1 h-5">
        <div className="absolute top-1/2 inset-x-0 border-t-2 border-dashed border-line" />
        <Plane
          size={18}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-primary text-primary bg-white px-0.5 box-content"
        />
        <span className="absolute top-[calc(50%+8px)] left-1/2 -translate-x-1/2 text-[10.5px] text-muted whitespace-nowrap font-semibold">
          {trip.stopCity ? `Escale ${trip.stopCity} · ${trip.stopDuration}` : "Vol direct"}
        </span>
      </div>

      {/* Point d'arrivée */}
      <div className="text-center min-w-14">
        <div className="font-bold text-sm">{compact ? arrivalCode : trip.arrivalCity}</div>
        <div className="text-xs text-muted">{arrivalTime}</div>
      </div>
    </div>
  );
}

/** Carte d'un voyage public (GET /api/public/trips) */
export default function TripCard({ trip }) {
  // Dates locales "AAAA-MM-JJTHH:mm" : on compare simplement les jours
  const sameDay = trip.departureAt.slice(0, 10) === trip.arrivalAt.slice(0, 10);
  const isMoveColis = trip.owner.role === "ADMIN";

  return (
    <Link
      to={paths.trip(trip.id)}
      className="block rounded-2xl overflow-hidden border border-line-light bg-white transition hover:shadow-card-hover hover:-translate-y-0.5"
    >
      {/* Couverture en dégradé (toujours la même couleur pour un trajet donné) avec badges */}
      <div className={`relative h-32 bg-gradient-to-br ${coverClassFor(trip)} flex items-end px-4 py-3.5`}>
        <span className="absolute top-3 left-3 bg-white text-ink text-xs font-bold rounded-full px-3 py-1.5 shadow-card">
          {formatKg(trip.kilosAvailable)} disponibles
        </span>
        <span className="absolute top-3 right-3 bg-ink/55 text-white text-[11px] font-semibold rounded-full px-2.5 py-1.5 backdrop-blur-sm">
          {isMoveColis ? "Vérifié · MoveColis" : `Voyageur · ${ownerLabel(trip.owner)}`}
        </span>
        <span className="text-white font-extrabold text-[17px] tracking-wide">
          {cityCode(trip.departureCity)} → {cityCode(trip.arrivalCity)}
        </span>
      </div>

      {/* Corps : route de vol + date + prix */}
      <div className="px-4 pt-3.5 pb-4">
        <RouteLine trip={trip} />
        <div className="flex justify-between items-center">
          <span className="text-[13px] text-muted">
            {formatTripDate(trip.departureAt)}
            {!sameDay && ` → ${formatTripDate(trip.arrivalAt)}`}
          </span>
          <span className="text-[15px]">
            <b className="font-extrabold">{formatMoney(trip.pricePerKilo, trip.currency)}</b>{" "}
            <span className="text-muted text-[13px]">/ kg</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
