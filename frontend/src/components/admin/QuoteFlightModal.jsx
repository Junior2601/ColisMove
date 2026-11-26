import { useState } from "react";
import { Check } from "lucide-react";
import LiveRequestLine from "../flights/LiveRequestLine";
import { Field, Modal, Notice, btnPrimary, inputClass } from "../ui";
import { adminApi } from "../../api/admin";
import { errorMessage, fieldErrors } from "../../api/client";
import { formatMoney } from "../../lib/format";
import { flightRouteLabel, passengersLabel } from "../../lib/flights";

const dayOf = (localIso) => localIso?.slice(0, 10) ?? "";
const timeOf = (localIso) => localIso?.slice(11, 16) ?? "";
const cityNames = (stops = []) => stops.map((stop) => stop.name ?? stop.code).filter(Boolean).join(", ");
const splitCities = (text) => text.split(",").map((city) => city.trim()).filter(Boolean);

/**
 * Un vol (aller ou retour) dans le formulaire : jour et heure locale de départ, arrivée, aéroports, escales.
 * Pas encore confirmé : jour de la demande et heure vue par le client ; sinon les valeurs déjà confirmées.
 */
function legForm(flight, seenTime, quoted) {
  return {
    date: dayOf(flight.departureAt),
    time: quoted ? timeOf(flight.departureAt) : (seenTime ?? ""),
    arrivalDate: quoted ? dayOf(flight.arrivalAt) : "",
    arrivalTime: quoted ? timeOf(flight.arrivalAt) : "",
    from: quoted ? (flight.originAirport ?? "") : "",
    to: quoted ? (flight.destinationAirport ?? "") : "",
    stops: quoted ? cityNames(flight.stops) : "",
  };
}

// Champs d'un vol → corps de la requête ("" → absent) ; prefix "return" pour le vol retour
function legBody(leg, prefix = "") {
  const key = (name) => (prefix ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}` : name);
  return {
    [key("departureAt")]: `${leg.date}T${leg.time}`,
    [key("arrivalAt")]: leg.arrivalTime ? `${leg.arrivalDate || leg.date}T${leg.arrivalTime}` : null,
    [key("originAirport")]: leg.from.trim() || null,
    [key("destinationAirport")]: leg.to.trim() || null,
    [key("stops")]: splitCities(leg.stops),
  };
}

function LegFields({ title, leg, onChange, errors, prefix = "" }) {
  const error = (name) => errors[prefix ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}` : name];
  const set = (field) => (e) => onChange({ ...leg, [field]: e.target.value });
  const upper = (field) => (e) => onChange({ ...leg, [field]: e.target.value.toUpperCase() });
  return (
    <fieldset className="border border-line-light rounded-xl px-3.5 pt-1 pb-0 mb-3">
      <legend className="text-[13px] font-extrabold px-1.5">{title}</legend>
      <div className="grid grid-cols-2 gap-x-2.5">
        <Field label="Départ le" error={error("departureAt")}>
          <input type="date" value={leg.date} onChange={set("date")} required className={inputClass} />
        </Field>
        <Field label="à (heure locale)">
          <input type="time" value={leg.time} onChange={set("time")} required className={inputClass} />
        </Field>
        <Field label="Arrivée le" hint="Facultatif." error={error("arrivalAt")}>
          <input type="date" value={leg.arrivalDate} onChange={set("arrivalDate")} min={leg.date} className={inputClass} />
        </Field>
        <Field label="à (heure locale)">
          <input type="time" value={leg.arrivalTime} onChange={set("arrivalTime")} className={inputClass} />
        </Field>
        <Field label="Aéroport de départ" hint="Facultatif, ex. DME." error={error("originAirport")}>
          <input value={leg.from} onChange={upper("from")} maxLength={3} placeholder="DME" className={inputClass} />
        </Field>
        <Field label="Aéroport d'arrivée" hint="Facultatif, ex. NSI." error={error("destinationAirport")}>
          <input value={leg.to} onChange={upper("to")} maxLength={3} placeholder="NSI" className={inputClass} />
        </Field>
      </div>
      <Field label="Escales" hint="Villes séparées par des virgules ; vide : vol direct." error={error("stops")}>
        <input value={leg.stops} onChange={set("stops")} maxLength={200} placeholder="Ex. Addis Abeba" className={inputClass} />
      </Field>
    </fieldset>
  );
}

/**
 * Demande « vol choisi en direct » : l'équipe a retrouvé le vol (lien du billet partagé, recherche du client) et
 * confirme compagnie, numéro, heures, escales, bagages et prix. Le client reçoit le récapitulatif dans la
 * conversation ; l'envoi du numéro de paiement devient possible. Rouvert tant que la demande est « À traiter ».
 */
export default function QuoteFlightModal({ order, onClose, onSaved }) {
  const quoted = Boolean(order.quotedAt);
  const live = order.liveRequest ?? {};
  const back = order.returnFlight;
  const [form, setForm] = useState(() => ({
    airline: order.flight.airline ?? "",
    flightNumber: order.flight.flightNumber ?? "",
    checkedBags: String(quoted ? order.flight.checkedBags : 1),
    checkedBagKg: String(order.flight.checkedBagKg ?? 23),
    cabinKg: quoted && order.flight.cabinKg !== null ? String(order.flight.cabinKg) : "",
    adultPrice: quoted ? String(order.adultPrice) : "",
    childPrice: quoted && order.children ? String(order.childPrice) : "",
    infantPrice: quoted && order.infants ? String(order.infantPrice) : "",
  }));
  const [outbound, setOutbound] = useState(() => legForm(order.flight, live.departureTime, quoted));
  const [inbound, setInbound] = useState(() => (back ? legForm(back, live.returnDepartureTime, quoted) : null));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field, transform = (v) => v) => (e) => {
    setForm((f) => ({ ...f, [field]: transform(e.target.value) }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };
  const price = (value) => Number(value) || 0;
  const total =
    order.adults * price(form.adultPrice) + order.children * price(form.childPrice) + order.infants * price(form.infantPrice);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const updated = await adminApi.quoteFlightOrder(order.id, {
        airline: form.airline.trim(),
        flightNumber: form.flightNumber.trim(),
        ...legBody(outbound),
        ...(inbound && legBody(inbound, "return")),
        checkedBags: Number(form.checkedBags),
        checkedBagKg: Number(form.checkedBagKg) || 23,
        cabinKg: form.cabinKg === "" ? null : Number(form.cabinKg),
        adultPrice: price(form.adultPrice),
        childPrice: order.children ? price(form.childPrice) : 0,
        infantPrice: order.infants ? price(form.infantPrice) : 0,
      });
      onSaved(updated);
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setError(Object.keys(byField).length ? "Vérifiez les champs signalés en rouge." : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal open title={quoted ? "Modifier le vol et le prix" : "Confirmer le vol et le prix"} onClose={saving ? undefined : onClose}>
      <p className="text-[13px] text-muted">
        <b className="text-ink">{order.reference}</b> ·{" "}
        {flightRouteLabel(order.flight.origin.name, order.flight.destination.name, Boolean(back))} · {passengersLabel(order)}
      </p>
      <div className="mb-3">
        <LiveRequestLine order={order} />
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-[1fr_1.4fr] gap-x-2.5">
          <Field label="Compagnie (code)" hint="2 caractères, ex. ET." error={errors.airline}>
            <input value={form.airline} onChange={set("airline", (v) => v.toUpperCase())} required maxLength={2}
              placeholder="ET" className={inputClass} />
          </Field>
          <Field label="Numéro du vol" hint={back ? "Vol aller, sans le code." : "Sans le code, ex. 761."} error={errors.flightNumber}>
            <input value={form.flightNumber} onChange={set("flightNumber", (v) => v.toUpperCase())} required maxLength={5}
              placeholder="761" className={inputClass} />
          </Field>
        </div>

        <LegFields title={back ? "Vol aller" : "Vol"} leg={outbound} onChange={setOutbound} errors={errors} />
        {inbound && <LegFields title="Vol retour" leg={inbound} onChange={setInbound} errors={errors} prefix="return" />}

        <fieldset className="border border-line-light rounded-xl px-3.5 pt-1 pb-0 mb-3">
          <legend className="text-[13px] font-extrabold px-1.5">Bagages{back ? " (aller et retour)" : ""}</legend>
          <div className="grid grid-cols-3 gap-x-2.5">
            <Field label="Valises en soute" hint="Par passager." error={errors.checkedBags}>
              <select value={form.checkedBags} onChange={set("checkedBags")} className={inputClass}>
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Poids (kg)" hint="D'une valise." error={errors.checkedBagKg}>
              <input type="number" min={1} max={50} value={form.checkedBagKg} onChange={set("checkedBagKg")} className={inputClass} />
            </Field>
            <Field label="Cabine (kg)" hint="Vide : inclus." error={errors.cabinKg}>
              <input type="number" min={0} max={30} value={form.cabinKg} onChange={set("cabinKg")} className={inputClass} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="border border-line-light rounded-xl px-3.5 pt-1 pb-2 mb-3">
          <legend className="text-[13px] font-extrabold px-1.5">Prix par passager ({order.currency}){back ? ", aller-retour" : ""}</legend>
          <div className="grid grid-cols-3 gap-x-2.5">
            <Field label="Adulte" error={errors.adultPrice}>
              <input type="number" min={1} step="any" value={form.adultPrice} onChange={set("adultPrice")} required className={inputClass} />
            </Field>
            {order.children > 0 && (
              <Field label="Enfant" error={errors.childPrice}>
                <input type="number" min={1} step="any" value={form.childPrice} onChange={set("childPrice")} required className={inputClass} />
              </Field>
            )}
            {order.infants > 0 && (
              <Field label="Bébé" error={errors.infantPrice}>
                <input type="number" min={1} step="any" value={form.infantPrice} onChange={set("infantPrice")} required className={inputClass} />
              </Field>
            )}
          </div>
          <div className="flex justify-between text-[15px] font-extrabold border-t border-line-light pt-2">
            <span>Total ({passengersLabel(order)})</span>
            <span>{formatMoney(total, order.currency)}</span>
          </div>
        </fieldset>

        {error && <Notice tone="danger">{error}</Notice>}
        <button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
          <Check size={17} /> {saving ? "Enregistrement…" : quoted ? "Enregistrer et prévenir le client" : "Confirmer au client"}
        </button>
        <p className="text-xs text-muted text-center mt-2">
          Le client reçoit ce récapitulatif dans la conversation. Envoyez-lui ensuite le numéro de paiement.
        </p>
      </form>
    </Modal>
  );
}
