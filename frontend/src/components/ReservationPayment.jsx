import { useState } from "react";
import { Banknote, CreditCard } from "lucide-react";
import ReservationStatusModal from "./ReservationStatusModal";
import { Badge, btnOutline, btnSm } from "./ui";
import { conversationsApi } from "../api/conversations";
import { errorMessage } from "../api/client";
import { formatKg, routeLabel, timeAgo } from "../lib/format";

/**
 * Paiement d'une réservation de kilos, pour le propriétaire du voyage ou l'équipe MoveColis :
 * « Envoyer le numéro de paiement » (message dans la conversation : numéros du voyageur, ou de MoveColis
 * pour ses voyages), puis « Paiement reçu » quand la capture du client est arrivée.
 * Indépendant des étapes du colis : disponible tant que le paiement n'est pas reçu.
 *  - reservation : { status, paymentInfoSentAt, paidAt, clientName, kilos, trackingCode } · trip : pour le résumé
 *  - onUpdated(patch) : { paymentInfoSentAt } ou { paidAt } · onFlash(texte, ton)
 */
export default function ReservationPaymentButtons({ reservation, trip, conversationId, onUpdated, onFlash }) {
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!conversationId || reservation.paidAt || reservation.status === "CANCELLED") return null;

  async function sendNumbers() {
    setSending(true);
    try {
      const { paymentInfoSentAt } = await conversationsApi.sendPaymentInfo(conversationId);
      onUpdated({ paymentInfoSentAt });
      onFlash?.("Numéros de paiement envoyés au client dans la conversation.");
    } catch (err) {
      onFlash?.(errorMessage(err), "danger");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={sendNumbers} disabled={sending} className={`${btnOutline} ${btnSm}`}>
        <CreditCard size={15} />
        {sending
          ? "Envoi…"
          : reservation.paymentInfoSentAt ? "Renvoyer le numéro de paiement" : "Envoyer le numéro de paiement"}
      </button>
      <button type="button" onClick={() => setConfirming(true)} className={`${btnOutline} ${btnSm}`}>
        <Banknote size={15} /> Paiement reçu
      </button>
      {confirming && (
        <ReservationStatusModal
          variant="payment"
          nextStatus="PAID"
          title="Paiement reçu"
          summary={`${reservation.clientName} · ${formatKg(reservation.kilos)} · ${routeLabel(trip)} (${reservation.trackingCode}).`}
          onClose={() => setConfirming(false)}
          onConfirm={async (note) => {
            const updated = await conversationsApi.markPaymentReceived(conversationId, note);
            onUpdated({ paidAt: updated.paidAt });
            setConfirming(false);
            onFlash?.(`${reservation.trackingCode} : paiement reçu.`);
          }}
        />
      )}
    </>
  );
}

/** Pastille « Payée », à côté de l'étape du colis */
export function PaidBadge({ reservation }) {
  return reservation.paidAt ? <Badge tone="success">Payée</Badge> : null;
}

/** Listes de réservations : où en est le paiement (rien si les numéros n'ont pas encore été envoyés) */
export function PaymentStatusLine({ reservation }) {
  if (reservation.paidAt || !reservation.paymentInfoSentAt || reservation.status === "CANCELLED") return null;
  return (
    <div className="text-xs text-ink font-semibold">
      💳 Numéros de paiement envoyés {timeAgo(reservation.paymentInfoSentAt)} : en attente de la capture du client
    </div>
  );
}
