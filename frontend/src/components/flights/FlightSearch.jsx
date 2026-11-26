import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, ChevronRight, Search, Zap } from "lucide-react";
import CityInput from "./CityInput";
import FlightOfferCard from "./FlightOfferCard";
import { ChipRow, ErrorState, FilterChip, Loader, Notice, btnPrimary, inputClass } from "../ui";
import { flightsApi } from "../../api/flights";
import { useApi } from "../../hooks/useApi";
import { formatMoney, plural, timeAgo } from "../../lib/format";
import {
  MAX_ROUND_TRIP_DAYS, addDays, flightRouteLabel, formatDay, isIsoDate, lastSearchDay, todayIso,
} from "../../lib/flights";
import { flightSearchCode, liveFlightsHref } from "../../lib/liveFlights";

// Trajets proposés en un clic (Russie ↔ Afrique)
const QUICK_ROUTES = [
  { origin: { code: "MOW", name: "Moscou" }, destination: { code: "ABJ", name: "Abidjan" } },
  { origin: { code: "ABJ", name: "Abidjan" }, destination: { code: "MOW", name: "Moscou" } },
  { origin: { code: "MOW", name: "Moscou" }, destination: { code: "DKR", name: "Dakar" } },
  { origin: { code: "MOW", name: "Moscou" }, destination: { code: "DLA", name: "Douala" } },
  { origin: { code: "LED", name: "Saint-Pétersbourg" }, destination: { code: "ABJ", name: "Abidjan" } },
];

// Durée de vol : aller, plus retour pour un aller-retour (durée inconnue = en dernier)
const travelMinutes = (offer) =>
  (offer.durationMinutes ?? 9999) + (offer.returnFlight ? (offer.returnFlight.durationMinutes ?? 9999) : 0);

const SORTS = [
  { key: "price", label: "Moins cher", compare: (a, b) => a.adultPrice - b.adultPrice },
  { key: "date", label: "Plus tôt", compare: (a, b) => a.departureAt.localeCompare(b.departureAt) },
  { key: "duration", label: "Plus rapide", compare: (a, b) => travelMinutes(a) - travelMinutes(b) },
];

const TRIP_TYPES = [
  { key: "ONE_WAY", label: "Aller simple" },
  { key: "ROUND_TRIP", label: "Aller-retour" },
];

const isCode = (value) => /^[A-Z]{3}$/.test(value ?? "");

// Départ proposé par défaut : dans 2 semaines (le client peut encore retirer des valises) · retour 2 semaines après
const DEFAULT_DAYS_AHEAD = 14;
const DEFAULT_STAY_DAYS = 14;

// Retour gardé s'il reste valable pour ce départ (le jour même jusqu'à 30 jours après), sinon 2 semaines après
function returnFor(date, returnDate, lastDay) {
  const latest = [addDays(date, MAX_ROUND_TRIP_DAYS), lastDay].sort()[0];
  if (returnDate && returnDate >= date && returnDate <= latest) return returnDate;
  return [addDays(date, DEFAULT_STAY_DAYS), latest].sort()[0];
}

/**
 * Lien vers « Vols en direct » (recherche Aviasales en temps réel), sur le trajet et les dates cherchés.
 * Lien classique (page rechargée) : le widget d'Aviasales lit la recherche dans l'adresse à son chargement.
 */
function LiveFlightsLink({ href }) {
  return (
    <a href={href}
      className="flex items-center gap-3 border border-line rounded-2xl bg-white px-4 py-3 mb-4 lg:max-w-4xl lg:mx-auto hover:border-ink transition">
      <span className="w-9 h-9 rounded-full bg-[#FDECEA] text-primary flex items-center justify-center shrink-0">
        <Zap size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">Vols en direct</span>
        <span className="block text-xs text-muted">Tous les billets du moment, toutes compagnies, aux prix en temps réel.</span>
      </span>
      <ChevronRight size={18} className="text-muted shrink-0" />
    </a>
  );
}

// Autres dates du même mois, avec leur prix le plus bas : un clic relance la recherche à ces dates
function NearbyDates({ nearby, currency, title, onPick }) {
  if (!nearby?.length) return null;
  const cheapest = Math.min(...nearby.map((d) => d.price));
  return (
    <div className="mb-4">
      <div className="text-[13px] font-bold mb-1.5">{title}</div>
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        {nearby.map((d) => (
          <button
            key={`${d.date}-${d.returnDate ?? ""}`}
            type="button"
            onClick={() => onPick(d)}
            className={`shrink-0 text-left rounded-xl border px-3 py-2 bg-white hover:border-ink transition ${
              d.price === cheapest ? "border-primary" : "border-line"
            }`}
          >
            <span className="block text-[12.5px] font-bold whitespace-nowrap">
              {formatDay(d.date)}
              {d.returnDate && ` → ${formatDay(d.returnDate)}`}
            </span>
            <span className="block text-[12px] text-muted whitespace-nowrap">
              dès <b className={d.price === cheapest ? "text-primary" : "text-ink"}>{formatMoney(d.price, currency)}</b>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Onglet « Billets d'avion » de l'accueil : formulaire + résultats.
 * La recherche est dans l'URL (?onglet=billets&origine=MOW&destination=ABJ&date=2026-12-15, plus
 * &retour=2027-01-05 pour un aller-retour) : partageable, et le bouton « retour » depuis un billet retrouve les résultats.
 */
export default function FlightSearch({ config }) {
  const [params, setParams] = useSearchParams();
  const query = {
    origin: params.get("origine"),
    destination: params.get("destination"),
    date: isIsoDate(params.get("date")) ? params.get("date") : null, // jour de départ
    // Aller-retour : jour du retour (ignoré s'il est invalide ou avant le départ)
    returnDate:
      isIsoDate(params.get("retour")) && params.get("retour") >= (params.get("date") ?? "") ? params.get("retour") : null,
    direct: params.get("direct") === "1",
    bags: params.get("bagages") === "1", // bagage en soute inclus (filtre appliqué ici, sur les résultats)
  };
  const hasQuery = isCode(query.origin) && isCode(query.destination) && Boolean(query.date);

  // Dates possibles : d'aujourd'hui à la fin du dernier mois proposé (même limite que le serveur)
  const firstDay = todayIso();
  const lastDay = lastSearchDay(config.monthsAhead);
  const [form, setForm] = useState(() => {
    const date = query.date && query.date >= firstDay && query.date <= lastDay ? query.date : addDays(firstDay, DEFAULT_DAYS_AHEAD);
    return {
      origin: isCode(query.origin) ? { code: query.origin, name: query.origin } : null,
      destination: isCode(query.destination) ? { code: query.destination, name: query.destination } : null,
      tripType: query.returnDate ? "ROUND_TRIP" : "ONE_WAY",
      date,
      returnDate: returnFor(date, query.returnDate, lastDay),
      direct: query.direct,
      bags: query.bags,
    };
  });
  const roundTripForm = form.tripType === "ROUND_TRIP";
  const latestReturn = [addDays(form.date || firstDay, MAX_ROUND_TRIP_DAYS), lastDay].sort()[0];
  const [errors, setErrors] = useState({});
  const [sort, setSort] = useState("price");

  const results = useApi(
    () =>
      hasQuery
        ? flightsApi.search({
            origin: query.origin,
            destination: query.destination,
            date: query.date,
            returnDate: query.returnDate,
            direct: query.direct || undefined,
          })
        : Promise.resolve(null),
    [query.origin, query.destination, query.date, query.returnDate, query.direct]
  );
  const roundTrip = Boolean(results.data?.returnDate);

  // Noms des villes reçus avec les résultats (ouverture depuis un lien qui ne contient que les codes)
  const [namedFrom, setNamedFrom] = useState(null);
  if (results.data && results.data !== namedFrom) {
    const data = results.data;
    setNamedFrom(data);
    setForm((f) => ({
      ...f,
      origin: f.origin?.code === data.origin.code ? data.origin : f.origin,
      destination: f.destination?.code === data.destination.code ? data.destination : f.destination,
    }));
  }

  function runSearch(next) {
    const missing = {
      ...(!next.origin && { origin: "Choisissez la ville de départ dans la liste." }),
      ...(!next.destination && { destination: "Choisissez la ville d'arrivée dans la liste." }),
    };
    if (!missing.origin && !missing.destination && next.origin.code === next.destination.code) {
      missing.destination = "Choisissez une ville différente du départ.";
    }
    if (!next.date || next.date < firstDay || next.date > lastDay) missing.date = "Choisissez la date de départ.";
    const roundTripNext = next.tripType === "ROUND_TRIP";
    if (roundTripNext && !missing.date && !(next.returnDate >= next.date && next.returnDate <= returnFor(next.date, next.returnDate, lastDay))) {
      missing.returnDate = `Retour entre le jour du départ et ${MAX_ROUND_TRIP_DAYS} jours après.`;
    }
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setParams({
      onglet: "billets",
      origine: next.origin.code,
      destination: next.destination.code,
      date: next.date,
      ...(roundTripNext && { retour: next.returnDate }),
      ...(next.direct && { direct: "1" }),
      ...(next.bags && { bagages: "1" }),
    });
  }

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Date proche choisie sous les résultats : nouvelle recherche à ces dates
  function pickNearby({ date, returnDate }) {
    const next = { ...form, date, returnDate: returnDate ?? form.returnDate, tripType: returnDate ? "ROUND_TRIP" : "ONE_WAY" };
    setForm(next);
    runSearch(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Même trajet et mêmes dates dans la recherche en direct (1 adulte : le client ajuste les passagers là-bas)
  const liveHref = hasQuery
    ? liveFlightsHref(flightSearchCode({ origin: query.origin, destination: query.destination, date: query.date, returnDate: query.returnDate }))
    : liveFlightsHref();

  const sorted = useMemo(() => {
    const items = (results.data?.items ?? []).filter((offer) => !query.bags || offer.checkedBags > 0);
    return [...items].sort(SORTS.find((s) => s.key === sort).compare);
  }, [results.data, sort, query.bags]);

  return (
    <>
      {/* ===== Formulaire ===== */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(form);
        }}
        className="border border-line rounded-2xl bg-white shadow-card p-4 my-4 lg:max-w-4xl lg:mx-auto"
        role="search"
        aria-label="Rechercher un billet d'avion"
      >
        {/* Aller simple / aller-retour */}
        <div role="radiogroup" aria-label="Type de billet" className="inline-flex rounded-full bg-surface p-1 mb-3">
          {TRIP_TYPES.map((type) => (
            <button
              key={type.key}
              type="button"
              role="radio"
              aria-checked={form.tripType === type.key}
              onClick={() => setForm((f) => ({ ...f, tripType: type.key }))}
              className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
                form.tripType === type.key ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start gap-2 lg:gap-3">
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 flex-1 min-w-0">
          <CityInput label="Départ" value={form.origin} onChange={set("origin")} placeholder="Ex. Moscou" error={errors.origin} />
          <button
            type="button"
            aria-label="Inverser départ et arrivée"
            onClick={() => setForm((f) => ({ ...f, origin: f.destination, destination: f.origin }))}
            className="self-center sm:mt-7 w-9 h-9 shrink-0 rounded-full border border-line bg-white flex items-center justify-center hover:border-ink transition rotate-90 sm:rotate-0"
          >
            <ArrowLeftRight size={16} />
          </button>
          <CityInput label="Arrivée" value={form.destination} onChange={set("destination")} placeholder="Ex. Abidjan" error={errors.destination} />
          </div>
          {/* Jours exacts, choisis dans le calendrier du téléphone ou du navigateur */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 shrink-0 lg:flex">
            <div className={roundTripForm ? "lg:w-44" : "col-span-2 lg:w-48"}>
              <label htmlFor="flight-date" className="block text-[13px] font-bold mb-1.5">
                {roundTripForm ? "Aller le" : "Date de départ"}
              </label>
              <input
                id="flight-date"
                type="date"
                value={form.date}
                min={firstDay}
                max={lastDay}
                required
                onChange={(e) => {
                  const date = e.target.value;
                  // Le retour suit le départ : gardé s'il reste valable, sinon décalé
                  setForm((f) => ({ ...f, date, returnDate: date ? returnFor(date, f.returnDate, lastDay) : f.returnDate }));
                  setErrors((errs) => ({ ...errs, date: undefined, returnDate: undefined }));
                }}
                aria-invalid={Boolean(errors.date)}
                className={inputClass}
              />
            </div>
            {roundTripForm && (
              <div className="lg:w-44">
                <label htmlFor="flight-return-date" className="block text-[13px] font-bold mb-1.5">Retour le</label>
                <input
                  id="flight-return-date"
                  type="date"
                  value={form.returnDate}
                  min={form.date || firstDay}
                  max={latestReturn}
                  required
                  onChange={(e) => {
                    setForm((f) => ({ ...f, returnDate: e.target.value }));
                    setErrors((errs) => ({ ...errs, returnDate: undefined }));
                  }}
                  aria-invalid={Boolean(errors.returnDate)}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        </div>
        {(errors.date || errors.returnDate) && (
          <div role="alert" className="text-xs text-danger font-semibold mt-1.5">{errors.date ?? errors.returnDate}</div>
        )}
        {roundTripForm && (
          <p className="text-xs text-muted mt-1.5">Retour au plus {MAX_ROUND_TRIP_DAYS} jours après le départ.</p>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={form.direct}
              onChange={(e) => setForm((f) => ({ ...f, direct: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            Vols directs uniquement
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={form.bags}
              onChange={(e) => setForm((f) => ({ ...f, bags: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            Bagage en soute inclus
          </label>
          <button type="submit" className={`${btnPrimary} sm:min-w-56`}>
            <Search size={17} /> Rechercher des billets
          </button>
        </div>
      </form>

      <LiveFlightsLink href={liveHref} />

      {/* ===== Trajets en un clic ===== */}
      {!hasQuery && (
        <>
          <div className="text-[13px] font-bold mb-2 lg:text-center">Trajets populaires</div>
          <div className="flex gap-2 flex-wrap lg:justify-center pb-6">
            {QUICK_ROUTES.map((route) => (
              <button
                key={`${route.origin.code}-${route.destination.code}`}
                type="button"
                onClick={() => {
                  const next = { ...form, ...route };
                  setForm(next);
                  runSearch(next);
                }}
                className="border border-line rounded-full px-4 py-2 text-[13px] font-semibold bg-white hover:border-ink transition"
              >
                {flightRouteLabel(route.origin.name, route.destination.name, roundTripForm)}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ===== Résultats ===== */}
      {hasQuery && results.error && <ErrorState error={results.error} onRetry={results.reload} />}
      {hasQuery && results.loading && !results.data && <Loader label="Recherche des meilleurs prix…" />}

      {hasQuery && results.data && (
        <div className={`pb-8 transition-opacity ${results.loading ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap justify-between items-end gap-2 mb-2">
            <div>
              <h2 className="text-lg font-extrabold">
                {flightRouteLabel(results.data.origin.name, results.data.destination.name, roundTrip)}
              </h2>
              <p className="text-[13px] text-muted">
                {roundTrip
                  ? `Aller-retour · ${formatDay(results.data.date)} → ${formatDay(results.data.returnDate)}`
                  : formatDay(results.data.date)}{" "}
                · {plural(sorted.length, "billet")}
                {query.direct && " · vols directs"}
                {query.bags && " · bagage en soute inclus"}
              </p>
            </div>
            {sorted.length > 1 && (
              <ChipRow>
                {SORTS.map((s) => (
                  <FilterChip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
                    {s.label}
                  </FilterChip>
                ))}
              </ChipRow>
            )}
          </div>

          <Notice>
            Prix relevés sur Aviasales {results.data.fetchedAt ? timeAgo(results.data.fetchedAt) : "récemment"}
            {results.data.stale && " (Aviasales ne répond pas : derniers prix connus)"}. Les tarifs des compagnies
            changent vite : l'équipe MoveColis vous confirme le prix exact dans la messagerie avant tout paiement.
          </Notice>

          {sorted.length === 0 ? (
            <>
              <div className="text-center py-8">
                <p className="font-extrabold text-[17px]">Aucun billet trouvé</p>
                <p className="text-muted text-sm mt-1">
                  {results.data.nearby?.length
                    ? "Choisissez une autre date ci-dessous"
                    : roundTrip
                      ? "Essayez d'autres dates ou un aller simple"
                      : "Essayez une autre date"}
                  {query.direct ? ", acceptez les escales" : ""}
                  {query.bags ? ", retirez le filtre « Bagage en soute inclus »" : ""}.
                </p>
                <a href={liveHref} className={`${btnPrimary} mt-4`}>
                  <Zap size={17} /> Voir les vols en direct
                </a>
                <p className="text-xs text-muted mt-2">Tous les billets du moment, sur toutes les compagnies.</p>
              </div>
              <NearbyDates nearby={results.data.nearby} currency={results.data.currency} title="Billets à d'autres dates"
                onPick={pickNearby} />
            </>
          ) : (
            <>
              <NearbyDates nearby={results.data.nearby} currency={results.data.currency} title="Autres dates, même mois"
                onPick={pickNearby} />
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" aria-label="Billets disponibles">
                {sorted.map((offer) => (
                  <FlightOfferCard key={offer.id} offer={offer} />
                ))}
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
