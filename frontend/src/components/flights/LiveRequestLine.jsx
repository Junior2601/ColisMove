import { ExternalLink } from "lucide-react";

/**
 * Demande « vol choisi en direct » : le vol tel que décrit par le client (compagnie, heures et prix vus) et le lien
 * vers sa recherche dans l'onglet « Billets d'avion » (le billet exact s'il l'a partagé). Rien pour un billet de nos résultats.
 */
export default function LiveRequestLine({ order }) {
  const live = order.liveRequest;
  if (!live) return null;
  const parts = [
    live.airline,
    live.departureTime && `départ vers ${live.departureTime}`,
    live.returnDepartureTime && `retour vers ${live.returnDepartureTime}`,
    live.seenPrice && `prix vu ${live.seenPrice}`,
  ].filter(Boolean);
  return (
    <div className="text-[13px] text-ink">
      🔎 Vol choisi en direct : {parts.join(" · ")}
      {live.url && (
        <>
          {" · "}
          {/* Nouvel onglet : la recherche d'Aviasales se charge avec cette adresse */}
          <a href={live.url} target="_blank" rel="noopener noreferrer" className="font-bold underline inline-flex items-center gap-1">
            {live.ticketId ? "Voir le billet choisi" : "Voir la recherche"} <ExternalLink size={12} />
          </a>
        </>
      )}
    </div>
  );
}
