import { useState } from "react";
import { ErrorState, Field, Modal, btnOutline, btnPrimary, btnSm, inputClass } from "../ui";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { joinLocal, routeLabel, splitLocal } from "../../lib/format";

/**
 * Modification d'un voyage de l'admin : dates/heures, escale, kilos, prix.
 * Le trajet et la devise ne se modifient pas (annuler puis recréer le voyage).
 * Seuls les champs réellement modifiés sont envoyés au backend.
 * save(id, patch) : adminApi.updateTrip par défaut, voyageurApi.updateTrip côté voyageur.
 */
export default function EditTripModal({ trip, onClose, onSaved, save = adminApi.updateTrip }) {
  const departure = splitLocal(trip.departureAt);
  const arrival = splitLocal(trip.arrivalAt);

  const [form, setForm] = useState({
    departureDate: departure.date,
    departureTime: departure.time,
    arrivalDate: arrival.date,
    arrivalTime: arrival.time,
    hasStop: Boolean(trip.stopCity),
    stopCity: trip.stopCity ?? "",
    stopDuration: trip.stopDuration ?? "",
    kilosTotal: String(trip.kilosTotal),
    pricePerKilo: String(trip.pricePerKilo),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (key) => (e) => {
    const { type, checked, value } = e.target;
    setForm((f) => ({ ...f, [key]: type === "checkbox" ? checked : value }));
  };

  function buildPatch() {
    const next = {
      departureAt: joinLocal(form.departureDate, form.departureTime),
      arrivalAt: joinLocal(form.arrivalDate, form.arrivalTime),
      stopCity: form.hasStop ? form.stopCity.trim() : null,
      stopDuration: form.hasStop ? form.stopDuration.trim() : null,
      kilosTotal: Number(form.kilosTotal),
      pricePerKilo: Number(form.pricePerKilo),
    };
    return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== trip[key]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) return onClose();

    setSubmitting(true);
    setError(null);
    try {
      const updated = await save(trip.id, patch);
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal open title="Modifier le voyage" onClose={submitting ? undefined : onClose}>
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-muted mb-4">
          {routeLabel(trip)} · prix en {trip.currency}. Pour changer de trajet, annulez puis créez un nouveau voyage.
        </p>

        <Field label={`Départ de ${trip.departureCity} (heure locale)`}>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" required value={form.departureDate} onChange={update("departureDate")} className={inputClass} />
            <input type="time" required value={form.departureTime} onChange={update("departureTime")} className={inputClass} />
          </div>
        </Field>

        <Field label={`Arrivée à ${trip.arrivalCity} (heure locale)`}>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" required value={form.arrivalDate} onChange={update("arrivalDate")} className={inputClass} />
            <input type="time" required value={form.arrivalTime} onChange={update("arrivalTime")} className={inputClass} />
          </div>
        </Field>

        <label className="flex items-center gap-2 text-[13px] font-bold mb-3 cursor-pointer">
          <input type="checkbox" checked={form.hasStop} onChange={update("hasStop")} className="w-4 h-4 accent-primary" />
          Vol avec escale
        </label>
        {form.hasStop && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ville d'escale">
              <input required value={form.stopCity} onChange={update("stopCity")} placeholder="Istanbul" className={inputClass} />
            </Field>
            <Field label="Durée d'escale">
              <input
                required
                value={form.stopDuration}
                onChange={update("stopDuration")}
                placeholder="3h20"
                pattern="\d{1,2}h[0-5]\d"
                title="Format : 3h20"
                className={inputClass}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Kilos disponibles"
            hint={trip.kilosReserved > 0 ? `Min. ${trip.kilosReserved} kg (déjà réservés)` : null}
          >
            <input
              type="number"
              required
              min={trip.kilosReserved || 0.5}
              step="any"
              value={form.kilosTotal}
              onChange={update("kilosTotal")}
              className={inputClass}
            />
          </Field>
          <Field label={`Prix par kilo (${trip.currency})`} hint="Les réservations existantes gardent leur prix.">
            <input
              type="number"
              required
              min="0"
              step="any"
              value={form.pricePerKilo}
              onChange={update("pricePerKilo")}
              className={inputClass}
            />
          </Field>
        </div>

        {error && <ErrorState message={error} />}

        <div className="flex gap-2 justify-end mt-2">
          <button type="button" onClick={onClose} disabled={submitting} className={`${btnOutline} ${btnSm}`}>
            Annuler
          </button>
          <button type="submit" disabled={submitting} className={`${btnPrimary} ${btnSm}`}>
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
