import { useState } from "react";
import { ErrorState, Field, Modal, btnDanger, btnOutline, btnPrimary, btnSm, inputClass } from "./ui";
import { errorMessage } from "../api/client";
import { FLIGHT_ORDER_STATUS, RESERVATION_STATUS } from "../lib/status";

// Libellés, aides et exemples de notes (visibles dans le suivi et la conversation) selon ce qui change de statut
const VARIANTS = {
  reservation: {
    labels: RESERVATION_STATUS,
    cancelLabel: "Annuler la réservation",
    cancelHint: "Les kilos seront remis en vente sur le voyage. Action définitive.",
    stepHint: "Cette étape apparaîtra dans le suivi et dans la conversation.",
    placeholders: {
      CONFIRMED: "Ex. Remise du colis samedi à Cocody",
      RECEIVED: "Ex. Colis pesé : 5 kg",
      IN_TRANSIT: "Ex. Escale à Istanbul",
      ARRIVED: "Ex. Arrivé à Moscou",
      DELIVERED: "Ex. Remis au destinataire",
      CANCELLED: "Ex. Changement de programme",
    },
  },
  // Kilos : « Paiement reçu », indépendant des étapes du colis
  payment: {
    labels: { PAID: { label: "Payée" } },
    cancelLabel: "",
    cancelHint: "",
    stepHint: "Le paiement apparaîtra dans la conversation et le client sera prévenu. L'étape du colis ne change pas.",
    placeholders: { PAID: "Ex. Orange Money reçu, réf. 4521" },
  },
  flight: {
    labels: FLIGHT_ORDER_STATUS,
    cancelLabel: "Annuler la demande",
    cancelHint: "La demande de billet sera close. Action définitive.",
    stepHint: "Cette étape apparaîtra dans la conversation et le client sera prévenu.",
    placeholders: {
      PAID: "Ex. Orange Money reçu, réf. 4521",
      ISSUED: "Ex. Numéro de réservation (PNR) : ABC123",
      CANCELLED: "Ex. Plus de place à ce prix",
    },
  },
};

/**
 * Confirmation d'un changement de statut avec note facultative.
 * onConfirm(note) fait l'appel API ; la modale gère l'attente et l'erreur.
 * variant : "reservation" (kilos), "payment" (paiement reçu, kilos) ou "flight" (demande de billet d'avion)
 */
export default function ReservationStatusModal({ nextStatus, summary, title, onConfirm, onClose, variant = "reservation" }) {
  const { labels, cancelLabel, cancelHint, stepHint, placeholders } = VARIANTS[variant];
  const cancelling = nextStatus === "CANCELLED";
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(note.trim() || undefined);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      title={title ?? (cancelling ? cancelLabel : `Passer à « ${labels[nextStatus].label} »`)}
      onClose={submitting ? undefined : onClose}
    >
      <p className="text-sm text-muted mb-4">
        {summary}{" "}
        {cancelling ? cancelHint : stepHint}
      </p>

      <Field label="Note (facultative)">
        <input
          value={note}
          maxLength={255}
          onChange={(e) => setNote(e.target.value)}
          placeholder={placeholders[nextStatus]}
          className={inputClass}
        />
      </Field>

      {error && <ErrorState message={error} />}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={submitting} className={`${btnOutline} ${btnSm}`}>
          Retour
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={`${cancelling ? btnDanger : btnPrimary} ${btnSm}`}
        >
          {submitting ? "Enregistrement…" : cancelling ? cancelLabel : "Confirmer"}
        </button>
      </div>
    </Modal>
  );
}
