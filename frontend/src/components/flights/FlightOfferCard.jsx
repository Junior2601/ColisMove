import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Info, Luggage, Plane } from "lucide-react";
import { formatMoney, formatTripDate, formatTripTime } from "../../lib/format";
import { airlineLogoUrl, baggageLabel, formatDuration, stopsLabel } from "../../lib/flights";
import { paths } from "../../lib/hashid";

// Logo de la compagnie ; à défaut (logo introuvable), son code dans une pastille
export function AirlineLogo({ code, name, className = "h-6" }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-surface text-xs font-extrabold font-mono">
        {code}
      </span>
    );
  }
  return <img src={airlineLogoUrl(code)} alt={name} className={`${className} w-auto max-w-28 object-contain`} onError={() => setFailed(true)} />;
}

// Départ ✈ arrivée (codes aéroport + villes), escales et durée sous la ligne.
// Aviasales ne donne que l'heure de départ et la durée : pas d'heure d'arrivée affichée.
export function FlightLine({ offer }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-center min-w-16 max-w-24">
        <div className="font-extrabold text-[17px]">{offer.originAirport ?? offer.origin.code}</div>
        <div className="text-xs text-muted font-semibold truncate">{offer.origin.name}</div>
      </div>
      <div className="relative flex-1 h-9">
        <div className="absolute top-1/2 inset-x-0 border-t-2 border-dashed border-line" />
        <Plane
          size={17}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-primary text-primary bg-white px-0.5 box-content"
        />
        <span className="absolute top-[calc(50%+9px)] left-1/2 -translate-x-1/2 text-[10.5px] text-muted whitespace-nowrap font-semibold">
          {[stopsLabel(offer.transfers), formatDuration(offer.durationMinutes)].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="text-center min-w-16 max-w-24">
        <div className="font-extrabold text-[17px]">{offer.destinationAirport ?? offer.destination.code}</div>
        <div className="text-xs text-muted font-semibold truncate">{offer.destination.name}</div>
      </div>
    </div>
  );
}

// Carte d'un billet dans les résultats de recherche
export default function FlightOfferCard({ offer }) {
  return (
    <Link
      to={paths.flightOffer(offer.id)}
      className="group border border-line-light rounded-2xl bg-white p-4 flex flex-col gap-3 hover:shadow-card transition"
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <AirlineLogo code={offer.airline} name={offer.airlineName} />
          <div className="text-xs text-muted mt-1 truncate">
            {offer.airlineName} · {offer.airline} {offer.flightNumber}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[19px] font-extrabold tracking-tight">{formatMoney(offer.adultPrice, offer.currency)}</div>
          <div className="text-[11.5px] text-muted">par adulte</div>
        </div>
      </div>

      <div className="text-[13px] font-bold">
        {formatTripDate(offer.departureAt)} · départ {formatTripTime(offer.departureAt)}
      </div>
      <FlightLine offer={offer} />

      <div className="text-[12.5px] text-muted flex items-center gap-1.5 mt-1">
        <Luggage size={15} className="shrink-0" /> {baggageLabel(offer)}
      </div>
      {offer.info && (
        <div className="text-[12.5px] text-ink flex items-center gap-1.5 -mt-1.5">
          <Info size={15} className="shrink-0 text-primary" /> {offer.info}
        </div>
      )}

      <span className="mt-auto inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-white font-bold text-sm py-2.5 group-hover:bg-primary-dark transition">
        Choisir ce billet <ChevronRight size={16} />
      </span>
    </Link>
  );
}
