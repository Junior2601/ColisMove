import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Info, Luggage, Plane } from "lucide-react";
import { formatMoney, formatTripDate, formatTripTime } from "../../lib/format";
import { airlineLogoUrl, arrivalDayShift, baggageLabel, formatDuration, stopsShortLabel } from "../../lib/flights";
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

// Une extrémité du vol : heure locale (ou code de l'aéroport si l'heure d'arrivée n'est pas connue), aéroport, ville
function FlightEnd({ time, shift = 0, airport, city }) {
  return (
    <div className="text-center min-w-16 max-w-24">
      <div className="font-extrabold text-[17px] whitespace-nowrap">
        {time ?? airport}
        {shift > 0 && <sup className="text-[10px] text-primary font-bold ml-0.5">+{shift} j</sup>}
      </div>
      <div className="text-xs text-muted font-semibold truncate">{time ? `${airport} · ${city}` : city}</div>
    </div>
  );
}

// Départ ✈ arrivée (heures locales, aéroports, villes), villes d'escale et durée totale sous la ligne
export function FlightLine({ offer }) {
  const withTimes = Boolean(offer.arrivalAt); // heure d'arrivée donnée par Aviasales
  const stops = stopsShortLabel(offer.transfers, offer.stops);
  return (
    <div className="flex items-center gap-2">
      <FlightEnd
        time={withTimes ? offer.departureAt.slice(11, 16) : null}
        airport={offer.originAirport ?? offer.origin.code}
        city={offer.origin.name}
      />
      <div className="relative flex-1 h-12 min-w-0">
        <div className="absolute top-1/2 inset-x-0 border-t-2 border-dashed border-line" />
        <Plane
          size={17}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-primary text-primary bg-white px-0.5 box-content"
        />
        <span className="absolute top-0 inset-x-0 text-center text-[10.5px] text-muted font-semibold truncate" title={stops}>
          {stops}
        </span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10.5px] text-muted whitespace-nowrap font-semibold">
          {formatDuration(offer.durationMinutes)}
        </span>
      </div>
      <FlightEnd
        time={withTimes ? offer.arrivalAt.slice(11, 16) : null}
        shift={withTimes ? arrivalDayShift(offer.departureAt, offer.arrivalAt) : 0}
        airport={offer.destinationAirport ?? offer.destination.code}
        city={offer.destination.name}
      />
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
