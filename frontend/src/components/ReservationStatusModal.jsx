import { useState } from "react";
import { ErrorState, Field, Modal, btnDanger, btnOutline, btnPrimary, btnSm, inputClass } from "./ui";
import { errorMessage } from "../api/client";
import { RESERVATION_STATUS } from "../lib/status";

// Exemples de notes selon l'étape (visibles dans le suivi et la conversation)
const NOTE_PLACEHOLDERS = {
  CONFIRMED: "Ex. Remise du colis samedi à Cocody",
  RECEIVED: "Ex. Colis pesé : 5 kg",
  IN_TRANSIT: "Ex. Escale à Istanbul",
  ARRIVED: "Ex. Arrivé à Moscou",
  DELIVERED: "Ex. Remis au destinataire",
  CANCELLED: "Ex. Changement de programme",
};

/**
 * Confirmation d'un changement de statut avec note facultative.
 * onConfirm(note) fait l'appel API ; la modale gère l'attente et l'erreur.
 */
export default function ReservationStatusModal({ nextStatus, summary, title, onConfirm, onClose }) {
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
      title={title ?? (cancelling ? "Annuler la réservation" : `Passer à « ${RESERVATION_STATUS[nextStatus].label} »`)}
      onClose={submitting ? undefined : onClose}
    >
      <p className="text-sm text-muted mb-4">
        {summary}{" "}
        {cancelling
          ? "Les kilos seront remis en vente sur le voyage. Action définitive."
          : "Cette étape apparaîtra dans le suivi et dans la conversation."}
      </p>

      <Field label="Note (facultative)">
        <input
          value={note}
          maxLength={255}
          onChange={(e) => setNote(e.target.value)}
          placeholder={NOTE_PLACEHOLDERS[nextStatus]}
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
          {submitting ? "Enregistrement…" : cancelling ? "Annuler la réservation" : "Confirmer"}
        </button>
      </div>
    </Modal>
  );
}
