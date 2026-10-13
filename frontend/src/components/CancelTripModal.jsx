import { useState } from "react";
import { ErrorState, Field, Modal, btnDanger, btnOutline, btnSm, inputClass } from "./ui";
import { errorMessage } from "../api/client";
import { formatTripDate, ownerLabel, plural, routeLabel } from "../lib/format";

/**
 * Annulation d'un voyage avec motif (admin ou voyageur).
 * onConfirm(reason) fait l'appel API ; la modale gère l'attente et l'erreur.
 */
export default function CancelTripModal({ trip, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim() || undefined);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  const count = trip.reservationsCount ?? 0;

  return (
    <Modal open title="Annuler ce voyage" onClose={submitting ? undefined : onClose}>
      <p className="text-sm text-muted mb-4">
        {routeLabel(trip)} · {formatTripDate(trip.departureAt)}
        {trip.owner && (
          <>
            {" "}— voyage de <b className="text-ink">{ownerLabel(trip.owner)}</b>
          </>
        )}
        .{" "}
        {count > 0
          ? `${plural(count, "réservation")} en cours ser${count > 1 ? "ont" : "a"} annulée${count > 1 ? "s" : ""} : chaque client est prévenu dans sa conversation.`
          : "Aucune réservation en cours."}{" "}
        Cette action est définitive.
      </p>

      <Field label="Motif (visible par les clients)">
        <textarea
          rows={2}
          maxLength={255}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex. Vol annulé par la compagnie"
          className={inputClass}
        />
      </Field>

      {error && <ErrorState message={error} />}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} disabled={submitting} className={`${btnOutline} ${btnSm}`}>
          Retour
        </button>
        <button type="button" onClick={handleConfirm} disabled={submitting} className={`${btnDanger} ${btnSm}`}>
          {submitting ? "Annulation…" : "Confirmer l'annulation"}
        </button>
      </div>
    </Modal>
  );
}
