import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Share2, Smartphone, Zap } from "lucide-react";
import { btnPrimary } from "../ui";
import { useConsent } from "../../context/ConsentContext";
import { LIVE_CONSENT_KEY, LIVE_ORDER_PATH, attachLiveWidget } from "../../lib/liveFlights";

// Recherche Aviasales (formulaire et résultats), placée dans un élément vide que React ne touche pas
function LiveWidget() {
  const hostRef = useRef(null);
  useEffect(() => attachLiveWidget(hostRef.current), []);
  return <div ref={hostRef} className="min-h-105" />;
}

const searchInAddress = () => new URLSearchParams(window.location.search).get("flightSearch") ?? "";

/**
 * Recherche en cours dans le widget ("" avant la première). Il l'écrit dans l'adresse (?flightSearch=…) sans
 * prévenir la page : on relit l'adresse toutes les demi-secondes tant que le widget est affiché.
 */
function useWidgetSearch(active) {
  const [search, setSearch] = useState(searchInAddress);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setSearch(searchInAddress()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return search;
}

// Descend jusqu'aux résultats du widget (sur téléphone, ils se chargent sous le formulaire, hors de vue)
function scrollToResults() {
  const results = document.getElementById("tpwl-tickets");
  if (!results) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  results.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

/** Nouvelle recherche lancée dans le widget → on descend jusqu'aux résultats qui se chargent */
function useScrollToNewSearch(active, search) {
  // Recherche déjà là en arrivant (lien partagé, retour du formulaire de paiement) : pas de saut
  const seen = useRef(search);
  useEffect(() => {
    if (!active || !search || search === seen.current) return;
    seen.current = search;
    scrollToResults();
  }, [active, search]);
}

// Avant l'accord : la recherche d'Aviasales (et ses cookies) n'est chargée qu'au clic
function ConsentGate({ onAccept }) {
  return (
    <div className="border border-line rounded-2xl bg-white p-5 sm:p-6 text-center max-w-xl mx-auto">
      <span className="w-11 h-11 rounded-full bg-[#FDECEA] text-primary flex items-center justify-center mx-auto mb-3">
        <Zap size={22} />
      </span>
      <h2 className="text-[17px] font-extrabold mb-1.5">Afficher la recherche de billets</h2>
      <p className="text-sm text-muted mb-4">
        Cette recherche est fournie par Aviasales. En l&apos;affichant, vous acceptez qu&apos;Aviasales dépose ses propres
        cookies (langue, devise, mesure de l&apos;utilisation de sa recherche).{" "}
        <Link to="/cookies#liste" className="font-bold underline text-ink">En savoir plus</Link>
      </p>
      <button type="button" onClick={onAccept} className={`${btnPrimary} w-full sm:w-auto`}>
        <Zap size={17} /> Afficher la recherche
      </button>
      <p className="text-xs text-muted mt-3">Votre choix est gardé sur cet appareil. Vous pouvez le changer dans « Gérer les cookies ».</p>
    </div>
  );
}

// Comment acheter un billet trouvé : un seul parcours, le paiement par MoveColis
function PayGuide() {
  return (
    <ol className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 text-[13px] text-muted mb-4 lg:max-w-4xl lg:mx-auto lg:justify-center">
      <li><b className="text-primary">1.</b> Cherchez votre vol</li>
      <li>
        <b className="text-primary">2.</b> « Sélectionner », puis <Share2 size={13} className="inline -mt-0.5" /> « Partager »
      </li>
      <li><b className="text-primary">3.</b> « Payer ce vol avec MoveColis »</li>
    </ol>
  );
}

/**
 * Recherche de billets de l'onglet « Billets d'avion » : Aviasales en temps réel (widget de marque blanche
 * Travelpayouts), avec tous les billets du moment. Le client choisit son vol et le paie avec MoveColis (Mobile Money) :
 * le formulaire reprend la recherche que le widget écrit dans l'adresse (?flightSearch=MOW1112YAO1). Aucun autre
 * moyen d'achat n'est présenté (les boutons « Acheter » propres au widget d'Aviasales ne peuvent pas être retirés).
 * canOrder : vente de billets par MoveColis activée par l'admin.
 */
export default function LiveFlightSearch({ canOrder }) {
  const navigate = useNavigate();
  const { consent, grant } = useConsent();
  const allowed = Boolean(consent?.choices?.[LIVE_CONSENT_KEY]);
  const search = useWidgetSearch(allowed);
  useScrollToNewSearch(allowed, search);
  const showPay = allowed && canOrder && Boolean(search);

  // Recherche et billet partagé en cours dans le widget, lus dans l'adresse au moment du clic
  function payWithMoveColis() {
    const current = new URLSearchParams(window.location.search);
    const next = new URLSearchParams();
    for (const key of ["flightSearch", "ticketId"]) {
      if (current.get(key)) next.set(key, current.get(key));
    }
    navigate(`${LIVE_ORDER_PATH}${next.size ? `?${next}` : ""}`);
  }

  return (
    <>
      <div className={showPay ? "pb-24 lg:pb-20" : "pb-8"}>
        {canOrder && <PayGuide />}
        {allowed ? <LiveWidget /> : <ConsentGate onAccept={() => grant(LIVE_CONSENT_KEY)} />}
      </div>

      {/* Une fois une recherche lancée, toujours à portée de main (au-dessus de la barre du bas sur mobile) ; avant,
          il cacherait le bouton « Recherche de vols » du widget */}
      {showPay && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-6 lg:bottom-6 z-40 flex justify-center">
          <button type="button" onClick={payWithMoveColis} className={`${btnPrimary} shadow-card-hover w-full sm:w-auto`}>
            <Smartphone size={18} /> Payer ce vol avec MoveColis
          </button>
        </div>
      )}
    </>
  );
}
