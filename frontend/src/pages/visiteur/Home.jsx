import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Package, Plane, Search } from "lucide-react";
import Layout from "../../components/Layout";
import TripCard from "../../components/TripCard";
import FlightSearch from "../../components/flights/FlightSearch";
import { ErrorState, LoadMore, Loader } from "../../components/ui";
import { publicApi } from "../../api/public";
import { flightsApi } from "../../api/flights";
import { landingPathFor, useAuth } from "../../context/AuthContext";
import { useApi, usePaginated } from "../../hooks/useApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

// Chaque pastille correspond à des paramètres de GET /api/public/trips
const FILTERS = [
  { key: "all", label: "Tous les voyages", params: {} },
  { key: "week", label: "Départ cette semaine", params: { week: true } },
  { key: "direct", label: "Vol direct", params: { direct: true } },
  ...["Abidjan", "Moscou", "Paris", "Dakar"].map((city) => ({ key: city, label: city, params: { city } })),
];

/**
 * "Abidjan → Moscou", "Abidjan -> Moscou", "Abidjan - Moscou", "Abidjan vers Moscou" → { from, to }
 * Sinon → { q } (une ville cherchée en départ, escale ou arrivée).
 * Les villes à tirets ("Rostov-sur-le-Don") ne sont pas coupées : le tiret doit être entouré d'espaces.
 */
function parseSearch(text) {
  const match = text.match(/^(.+?)\s*(?:→|->|>|\s-\s|\svers\s)\s*(.+)$/i);
  if (match) return { from: match[1].trim(), to: match[2].trim() };
  const q = text.replace(/\s*(?:→|->|>)\s*$/, "").trim();
  return q ? { q } : {};
}

// Onglets de l'accueil : envoi de colis (par défaut) et achat de billets d'avion
const TABS = [
  { key: "colis", label: "Envoyer un colis", Icon: Package },
  { key: "billets", label: "Billets d'avion", Icon: Plane },
];

export default function Home() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Vente de billets activée par l'admin ? (sinon, pas d'onglet : l'accueil reste celui des colis)
  const flights = useApi(() => flightsApi.config().catch(() => null), []);
  const flightsEnabled = Boolean(flights.data?.enabled);
  const tab = flightsEnabled && searchParams.get("onglet") === "billets" ? "billets" : "colis";
  // Ouverture depuis l'icône de l'écran d'accueil (start_url "/?source=pwa" du manifeste)
  const openedFromApp = searchParams.get("source") === "pwa";

  // Lien d'une notification : /?vers=Abidjan ou /?de=Moscou&vers=Abidjan → recherche pré-remplie
  const from = searchParams.get("de");
  const to = searchParams.get("vers");
  const linkedRoute = from && to ? `${from} → ${to}` : to || from || "";
  const [query, setQuery] = useState(linkedRoute);
  // Notification ouverte alors que l'accueil est déjà affiché : on suit le nouveau lien
  const [followedRoute, setFollowedRoute] = useState(linkedRoute);
  if (linkedRoute !== followedRoute) {
    setFollowedRoute(linkedRoute);
    if (linkedRoute) setQuery(linkedRoute);
  }
  const search = useDebouncedValue(query.trim());
  const [filterKey, setFilterKey] = useState("all");
  const filter = FILTERS.find((f) => f.key === filterKey);

  const trips = usePaginated(
    (page) => publicApi.listTrips({ ...parseSearch(search), ...filter.params, ...page }),
    [search, filterKey],
    24
  );

  // Appli installée ouverte par un admin ou un voyageur → directement sur son tableau de bord.
  // (La liste des voyages reste accessible via le lien "Voyages" : seule l'ouverture de l'appli redirige.)
  if (openedFromApp && loading) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }
  if (openedFromApp && landingPathFor(user) !== "/") {
    return <Navigate to={landingPathFor(user)} replace />;
  }

  return (
    <Layout>
      {/* ===== Onglets Colis / Billets d'avion ===== */}
      {flightsEnabled && (
        <div role="tablist" aria-label="Services MoveColis" className="flex gap-1.5 bg-surface rounded-full p-1 mt-5 w-fit lg:mx-auto">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setSearchParams(key === "billets" ? { onglet: "billets" } : {})}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-bold transition ${
                tab === key ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              <Icon size={16} className={tab === key ? "text-primary" : ""} /> {label}
            </button>
          ))}
        </div>
      )}

      {searchParams.get("onglet") === "billets" && flights.loading && !flights.data ? (
        <Loader />
      ) : tab === "billets" ? (
        <>
          <section className="pt-5 pb-1 lg:pt-7 lg:text-center">
            <h1 className="text-[26px] lg:text-[34px] font-extrabold tracking-tight leading-tight">
              Votre <em className="not-italic text-primary">billet d'avion</em> au meilleur prix
            </h1>
            <p className="text-muted mt-2 text-[14.5px]">
              Comparez les prix des compagnies, ajoutez vos bagages et options : l'équipe MoveColis confirme et émet
              votre billet dans la messagerie.
            </p>
          </section>
          <FlightSearch config={flights.data} />
        </>
      ) : (
        <ParcelsTab
          user={user}
          query={query}
          setQuery={setQuery}
          filterKey={filterKey}
          setFilterKey={setFilterKey}
          trips={trips}
          compactHero={flightsEnabled}
        />
      )}
    </Layout>
  );
}

/* ===== Onglet « Envoyer un colis » : recherche et grille des voyages ===== */
function ParcelsTab({ user, query, setQuery, filterKey, setFilterKey, trips, compactHero }) {
  return (
    <>
      {/* ===== Héros ===== */}
      <section className={`${compactHero ? "pt-5 lg:pt-7" : "pt-6 lg:pt-10"} pb-2 lg:text-center`}>
        <h1 className="text-[26px] lg:text-[34px] font-extrabold tracking-tight leading-tight">
          Envoyez vos colis avec les{" "}
          <em className="not-italic text-primary">kilos disponibles</em> des voyageurs
        </h1>
        <p className="text-muted mt-2 text-[14.5px]">
          Réservez des kilos sur un vol au départ de votre ville. Simple, rapide, confirmé dans la messagerie MoveColis.
        </p>
      </section>

      {/* ===== Recherche (pilule) ===== */}
      <form
        onSubmit={(e) => e.preventDefault()}
        role="search"
        className="flex items-center gap-2.5 border border-line rounded-full py-2.5 pl-5 pr-2.5 shadow-card bg-white my-4 lg:max-w-xl lg:mx-auto lg:my-5"
      >
        <Search size={18} className="text-muted shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Où envoyez-vous ? Ex. Abidjan → Moscou"
          aria-label="Rechercher un trajet"
          className="flex-1 min-w-0 outline-none text-sm font-medium bg-transparent"
        />
        <button
          type="submit"
          aria-label="Rechercher"
          className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0 hover:bg-primary-dark transition"
        >
          <Search size={16} strokeWidth={3} />
        </button>
      </form>

      {/* ===== Filtres (puces défilantes) ===== */}
      <div
        className="flex gap-2 overflow-x-auto pb-3.5 pt-1 scrollbar-none [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Filtres"
      >
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filterKey === f.key}
            onClick={() => setFilterKey(f.key)}
            className={`border rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition ${
              filterKey === f.key
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink hover:border-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ===== Grille des voyages ===== */}
      {trips.error && <ErrorState error={trips.error} onRetry={trips.reload} />}

      {trips.loading && trips.items.length === 0 ? (
        <Loader label="Recherche des voyages…" />
      ) : (
        <div className={`transition-opacity ${trips.loading ? "opacity-60" : ""}`}>
          <section
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-8"
            aria-label="Voyages disponibles"
          >
            {trips.items.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}

            {!trips.loading && !trips.error && trips.items.length === 0 && (
              <p className="text-muted text-sm col-span-full py-8 text-center">
                Aucun voyage ne correspond à votre recherche. Essayez une autre ville.
              </p>
            )}
          </section>
          <LoadMore hasMore={trips.hasMore} loading={trips.loadingMore} onClick={trips.loadMore} />
        </div>
      )}

      {/* ===== Bannière visiteur ===== */}
      {!user && (
        <div className="rounded-xl px-4 py-3.5 text-[13.5px] bg-[#F0F7FF] text-[#1565C0] my-3.5">
          <b>Vous réservez sans compte ?</b> C'est possible ! Mais avec un compte client, vous
          retrouvez vos conversations et l'historique de vos colis sur tous vos appareils.{" "}
          <Link to="/inscription" className="font-bold underline">
            Créer un compte
          </Link>
        </div>
      )}
    </>
  );
}
