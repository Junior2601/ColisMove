import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Share2, Smartphone, Zap } from "lucide-react";
import Layout from "../../components/Layout";
import { btnPrimary } from "../../components/ui";
import { flightsApi } from "../../api/flights";
import { useConsent } from "../../context/ConsentContext";
import { useApi } from "../../hooks/useApi";
import { LIVE_CONSENT_KEY, LIVE_ORDER_PATH, attachLiveWidget } from "../../lib/liveFlights";

// Recherche Aviasales (formulaire et résultats), placée dans un élément vide que React ne touche pas
function LiveWidget() {
  const hostRef = useRef(null);
  useEffect(() => attachLiveWidget(hostRef.current), []);
  return <div ref={hostRef} className="min-h-105" />;
}

// Avant l'accord : la recherche d'Aviasales (et ses cookies) n'est chargée qu'au clic
function ConsentGate({ onAccept }) {
  return (
    <div className="border border-line rounded-2xl bg-white p-5 sm:p-6 text-center max-w-xl mx-auto">
      <span className="w-11 h-11 rounded-full bg-[#FDECEA] text-primary flex items-center justify-center mx-auto mb-3">
        <Zap size={22} />
      </span>
      <h2 className="text-[17px] font-extrabold mb-1.5">Afficher la recherche en direct</h2>
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

// Les deux façons d'acheter un billet trouvé dans la recherche
function HowToBuy({ canOrder }) {
  return (
    <div className={`grid gap-3 mb-5 ${canOrder ? "sm:grid-cols-2" : ""}`}>
      <div className="border border-line-light rounded-2xl bg-white px-4 py-3.5 flex gap-3">
        <CreditCard size={20} className="text-muted shrink-0 mt-0.5" />
        <div className="text-[13.5px]">
          <div className="font-extrabold text-sm mb-0.5">Par carte bancaire</div>
          Touchez « Sélectionner », puis « Acheter » : vous payez directement l&apos;agence choisie.
        </div>
      </div>
      {canOrder && (
        <div className="border border-primary/40 rounded-2xl bg-[#FFF8F4] px-4 py-3.5 flex gap-3">
          <Smartphone size={20} className="text-primary shrink-0 mt-0.5" />
          <div className="text-[13.5px]">
            <div className="font-extrabold text-sm mb-0.5">En Mobile Money, avec MoveColis</div>
            Touchez « Sélectionner », puis <Share2 size={13} className="inline -mt-0.5" /> « Partager » pour copier le
            lien du billet, et enfin « Payer ce vol avec MoveColis ».
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Page « Vols en direct » : la recherche d'Aviasales en temps réel (widget de marque blanche Travelpayouts), avec
 * tous les billets du moment. Achat par carte chez l'agence, ou demande à MoveColis (paiement Mobile Money).
 * La recherche est dans l'adresse (?flightSearch=MOW1112YAO1), écrite par le widget : le formulaire de MoveColis
 * la reprend pour pré-remplir le trajet, les dates et les passagers.
 */
export default function LiveFlights() {
  const navigate = useNavigate();
  const { consent, grant } = useConsent();
  const allowed = Boolean(consent?.choices?.[LIVE_CONSENT_KEY]);
  const { data: config } = useApi(flightsApi.config, []);
  const canOrder = Boolean(config?.enabled);

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
    <Layout>
      <div className={allowed && canOrder ? "pb-24 lg:pb-20" : "pb-8"}>
        <Link to="/?onglet=billets" className="inline-flex items-center gap-1.5 font-semibold underline text-sm mt-3 p-2 -ml-2">
          <ArrowLeft size={16} /> Billets d&apos;avion
        </Link>

        <div className="mt-2 mb-4">
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Zap size={22} className="text-primary" /> Vols en direct
          </h1>
          <p className="text-sm text-muted mt-1">
            Tous les billets du moment, toutes compagnies et agences confondues, aux prix d&apos;Aviasales en temps réel.
          </p>
        </div>

        <HowToBuy canOrder={canOrder} />

        {allowed ? <LiveWidget /> : <ConsentGate onAccept={() => grant(LIVE_CONSENT_KEY)} />}
      </div>

      {/* Toujours à portée de main pendant la recherche (au-dessus de la barre du bas sur mobile) */}
      {allowed && canOrder && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-6 lg:bottom-6 z-40 flex justify-center">
          <button type="button" onClick={payWithMoveColis} className={`${btnPrimary} shadow-card-hover w-full sm:w-auto`}>
            <Smartphone size={18} /> Payer ce vol avec MoveColis
          </button>
        </div>
      )}
    </Layout>
  );
}
