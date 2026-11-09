import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Search } from "lucide-react";
import CityInput from "./CityInput";
import FlightOfferCard from "./FlightOfferCard";
import { ChipRow, ErrorState, FilterChip, Loader, Notice, btnPrimary, inputClass } from "../ui";
import { flightsApi } from "../../api/flights";
import { useApi } from "../../hooks/useApi";
import { plural, timeAgo } from "../../lib/format";
import { defaultMonth, formatMonth, upcomingMonths } from "../../lib/flights";

// Trajets proposés en un clic (Russie ↔ Afrique)
const QUICK_ROUTES = [
  { origin: { code: "MOW", name: "Moscou" }, destination: { code: "ABJ", name: "Abidjan" } },
  { origin: { code: "ABJ", name: "Abidjan" }, destination: { code: "MOW", name: "Moscou" } },
  { origin: { code: "MOW", name: "Moscou" }, destination: { code: "DKR", name: "Dakar" } },
  { origin: { code: "MOW", name: "Moscou" }, destination: { code: "DLA", name: "Douala" } },
  { origin: { code: "LED", name: "Saint-Pétersbourg" }, destination: { code: "ABJ", name: "Abidjan" } },
];

const SORTS = [
  { key: "price", label: "Moins cher", compare: (a, b) => a.adultPrice - b.adultPrice },
  { key: "date", label: "Plus tôt", compare: (a, b) => a.departureAt.localeCompare(b.departureAt) },
  { key: "duration", label: "Plus rapide", compare: (a, b) => (a.durationMinutes ?? 9999) - (b.durationMinutes ?? 9999) },
];

const isCode = (value) => /^[A-Z]{3}$/.test(value ?? "");

/**
 * Onglet « Billets d'avion » de l'accueil : formulaire + résultats.
 * La recherche est dans l'URL (?onglet=billets&origine=MOW&destination=ABJ&mois=2026-12) : partageable, et
 * le bouton « retour » depuis un billet retrouve les résultats.
 */
export default function FlightSearch({ config }) {
  const [params, setParams] = useSearchParams();
  const query = {
    origin: params.get("origine"),
    destination: params.get("destination"),
    month: params.get("mois"),
    direct: params.get("direct") === "1",
    bags: params.get("bagages") === "1", // bagage en soute inclus (filtre appliqué ici, sur les résultats)
  };
  const hasQuery = isCode(query.origin) && isCode(query.destination) && /^\d{4}-\d{2}$/.test(query.month ?? "");

  const months = useMemo(() => upcomingMonths(config.monthsAhead), [config.monthsAhead]);
  const [form, setForm] = useState(() => ({
    origin: isCode(query.origin) ? { code: query.origin, name: query.origin } : null,
    destination: isCode(query.destination) ? { code: query.destination, name: query.destination } : null,
    month: months.some((m) => m.value === query.month) ? query.month : defaultMonth(),
    direct: query.direct,
    bags: query.bags,
  }));
  const [errors, setErrors] = useState({});
  const [sort, setSort] = useState("price");

  const results = useApi(
    () =>
      hasQuery
        ? flightsApi.search({ ...query, direct: query.direct || undefined })
        : Promise.resolve(null),
    [query.origin, query.destination, query.month, query.direct]
  );

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
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setParams({
      onglet: "billets",
      origine: next.origin.code,
      destination: next.destination.code,
      mois: next.month,
      ...(next.direct && { direct: "1" }),
      ...(next.bags && { bagages: "1" }),
    });
  }

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

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
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
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
          <div className="sm:w-48 shrink-0">
            <label htmlFor="flight-month" className="block text-[13px] font-bold mb-1.5">Mois de départ</label>
            <select
              id="flight-month"
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              className={inputClass}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

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
                {route.origin.name} → {route.destination.name}
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
                {results.data.origin.name} → {results.data.destination.name}
              </h2>
              <p className="text-[13px] text-muted">
                {formatMonth(results.data.month)} · {plural(sorted.length, "billet")}
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
            <div className="text-center text-muted text-sm py-10">
              Aucun billet trouvé pour ce mois. Essayez un autre mois{query.direct ? ", acceptez les escales" : ""}
              {query.bags ? ", retirez le filtre « Bagage en soute inclus »" : ""} ou
              une ville proche.
              <br />
              Aviasales ne garde que les prix vus récemment par ses utilisateurs : un trajet peu demandé peut ne rien
              afficher.
            </div>
          ) : (
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" aria-label="Billets disponibles">
              {sorted.map((offer) => (
                <FlightOfferCard key={offer.id} offer={offer} />
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}
