import { useMemo, useState } from "react";
import { EyeOff, Eye, ExternalLink, Pencil, RotateCw, Search } from "lucide-react";
import CityInput from "../flights/CityInput";
import { AirlineLogo } from "../flights/FlightOfferCard";
import {
  Badge, ErrorState, Field, Loader, Modal, Notice, Toast, btnOutline, btnPrimary, btnSm, inputClass,
} from "../ui";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useFlash } from "../../hooks/useFlash";
import { currencySymbol, formatMoney, formatNumber, formatTripDate, formatTripTime, plural, timeAgo } from "../../lib/format";
import {
  arrivalTimeLabel, baggageLabel, defaultMonth, flightRouteLabel, flightTimesLabel, formatDuration, formatMonth, stopsLabel,
  upcomingMonths,
} from "../../lib/flights";

// "Décembre 2026", "Décembre 2026, retour Janvier 2027" (aller-retour)
const monthsLabel = (month, returnMonth) => `${formatMonth(month)}${returnMonth ? `, retour ${formatMonth(returnMonth)}` : ""}`;

// Ce que dit Aviasales sur ce tarif : "2 valises de 23 kg · cabine incluse · modifiable · non remboursable"
function fareLabel(fare) {
  const parts = [];
  if (fare.checkedBags === null) parts.push("valises non précisées");
  else if (fare.checkedBags === 0) parts.push("sans valise en soute");
  else parts.push(`${plural(fare.checkedBags, "valise")}${fare.bagKg ? ` de ${fare.bagKg} kg` : ""}`);
  if (fare.cabinBag !== null) parts.push(fare.cabinBag ? "cabine incluse" : "sans bagage cabine");
  if (fare.changeable !== null) parts.push(fare.changeable ? "modifiable" : "non modifiable");
  if (fare.refundable !== null) parts.push(fare.refundable ? "remboursable" : "non remboursable");
  return parts.join(" · ");
}

// "" → null (= règle générale), sinon nombre
const numberOrNull = (value) => (String(value).trim() === "" ? null : Number(String(value).replace(",", ".")));

/* ===== Modification d'un billet : bagages, précision, visibilité (le prix reste celui d'Aviasales) ===== */
function EditOfferModal({ offer, settings, onClose, onSaved }) {
  const [form, setForm] = useState({
    checkedBags: offer.checkedBagsOverride ?? "",
    cabinKg: offer.cabinKgOverride ?? "",
    info: offer.info ?? "",
    hidden: offer.hidden,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.updateFlightOffer(offer.id, {
        checkedBags: numberOrNull(form.checkedBags),
        cabinKg: numberOrNull(form.cabinKg),
        info: form.info.trim() || null,
        hidden: form.hidden,
      });
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal open title="Modifier le billet" onClose={saving ? undefined : onClose}>
      <p className="text-sm text-muted mb-4">
        {offer.airlineName} {offer.airline} {offer.flightNumber} · {formatTripDate(offer.departureAt)} à{" "}
        {formatTripTime(offer.departureAt)}
        {offer.returnFlight && `, retour le ${formatTripDate(offer.returnFlight.departureAt)} à ${formatTripTime(offer.returnFlight.departureAt)}`}.
        Prix client : {formatMoney(offer.adultPrice, offer.currency)}{offer.returnFlight && " l'aller-retour"} (prix exact
        d&apos;Aviasales, {formatNumber(offer.sourcePrice)} {currencySymbol(offer.sourceCurrency)}). Laissez un champ vide
        pour garder les bagages d&apos;Aviasales ({fareLabel(offer.fare)}). Vos modifications sont conservées quand
        Aviasales met ses prix à jour.
      </p>
      <form onSubmit={handleSave}>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Valises en soute par passager"
            hint={offer.fare.checkedBags !== null ? `Aviasales : ${offer.fare.checkedBags}` : `Réglage : ${settings.defaultCheckedBags}`}
          >
            <input value={form.checkedBags} onChange={set("checkedBags")} inputMode="numeric"
              placeholder={String(offer.fare.checkedBags ?? settings.defaultCheckedBags)} className={inputClass} />
          </Field>
          <Field
            label="Bagage cabine (kg)"
            hint={offer.fare.cabinBag !== null ? `Aviasales : ${offer.fare.cabinBag ? "inclus" : "aucun"}` : `Réglage : ${settings.defaultCabinKg} kg`}
          >
            <input value={form.cabinKg} onChange={set("cabinKg")} inputMode="numeric"
              placeholder={offer.fare.cabinBag === false ? "0" : offer.fare.cabinBag ? "Poids ?" : String(settings.defaultCabinKg)}
              className={inputClass} />
          </Field>
        </div>
        <Field label="Précision affichée au client (facultatif)">
          <input value={form.info} onChange={set("info")} maxLength={160} placeholder="Ex. Repas inclus, escale de nuit à Istanbul"
            className={inputClass} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-semibold mb-4 cursor-pointer">
          <input type="checkbox" checked={form.hidden} onChange={set("hidden")} className="w-4 h-4 accent-primary" />
          Masquer ce billet aux clients
        </label>

        {error && <ErrorState message={error} />}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={`${btnOutline} ${btnSm}`}>Retour</button>
          <button type="submit" disabled={saving} className={`${btnPrimary} ${btnSm}`}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OfferRow({ offer, onEdit, onToggleHidden }) {
  const edited = offer.checkedBagsOverride !== null || offer.cabinKgOverride !== null || offer.info;
  return (
    <div className={`border border-line-light rounded-2xl bg-white p-4 ${offer.hidden || offer.stale ? "opacity-70" : ""}`}>
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <AirlineLogo code={offer.airline} name={offer.airlineName} />
          <div className="min-w-0">
            <div className="font-bold text-sm">
              {formatTripDate(offer.departureAt)} · {formatTripTime(offer.departureAt)}
              {offer.arrivalAt && ` → ${arrivalTimeLabel(offer.departureAt, offer.arrivalAt)}`}
            </div>
            <div className="text-xs text-muted">
              {offer.airlineName} {offer.airline} {offer.flightNumber} · {offer.originAirport ?? offer.origin.code} →{" "}
              {offer.destinationAirport ?? offer.destination.code} · {stopsLabel(offer.transfers, offer.stops)}
              {offer.durationMinutes ? ` · ${formatDuration(offer.durationMinutes)}` : ""}
              {offer.gate && ` · prix trouvé chez ${offer.gate}`}
            </div>
            {/* Aller-retour : le vol retour (même billet, même prix) */}
            {offer.returnFlight && (
              <div className="text-xs text-muted">
                <b className="text-ink">Retour {flightTimesLabel(offer.returnFlight)}</b> ·{" "}
                {offer.returnFlight.originAirport ?? offer.returnFlight.origin.code} →{" "}
                {offer.returnFlight.destinationAirport ?? offer.returnFlight.destination.code} ·{" "}
                {stopsLabel(offer.returnFlight.transfers, offer.returnFlight.stops)}
                {offer.returnFlight.durationMinutes ? ` · ${formatDuration(offer.returnFlight.durationMinutes)}` : ""}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {offer.hidden && <Badge tone="danger">Masqué</Badge>}
          {offer.stale && <Badge tone="pending">Plus proposé par Aviasales</Badge>}
          {edited && <Badge tone="info">Modifié</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-[13px]">
        <div>
          <div className="text-xs text-muted">Prix Aviasales</div>
          <div className="font-semibold">{formatNumber(offer.sourcePrice)} {currencySymbol(offer.sourceCurrency)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Prix client (adulte{offer.returnFlight ? ", aller-retour" : ""})</div>
          <div className="font-extrabold">{formatMoney(offer.adultPrice, offer.currency)}</div>
        </div>
      </div>
      <div className="text-xs text-muted mt-2">
        Client : {baggageLabel(offer)}
        {(offer.checkedBagsOverride !== null || offer.cabinKgOverride !== null) && " *"}
        {offer.baggageSource === "DEFAULT" && " (réglages : Aviasales ne précise pas)"}
        {offer.info && ` · « ${offer.info} »`}
      </div>
      <div className="text-xs text-muted">Tarif Aviasales : {fareLabel(offer.fare)}</div>

      <div className="flex gap-2 flex-wrap mt-3">
        <button type="button" onClick={() => onEdit(offer)} className={`${btnPrimary} ${btnSm}`}>
          <Pencil size={14} /> Modifier
        </button>
        <button type="button" onClick={() => onToggleHidden(offer)} className={`${btnOutline} ${btnSm}`}>
          {offer.hidden ? <Eye size={14} /> : <EyeOff size={14} />} {offer.hidden ? "Afficher" : "Masquer"}
        </button>
        {offer.purchaseUrl && (
          <a href={offer.purchaseUrl} target="_blank" rel="noopener noreferrer" className={`${btnOutline} ${btnSm}`}>
            <ExternalLink size={14} /> Voir sur Aviasales
          </a>
        )}
      </div>
    </div>
  );
}

/* ===== Onglet « Billets Aviasales » : les billets d'un trajet, modifiables un par un ===== */
export default function FlightOffersAdmin({ settings }) {
  const months = useMemo(() => upcomingMonths(), []);
  // returnMonth : "" pour l'aller simple, sinon mois du retour (billets aller-retour)
  const [form, setForm] = useState({ origin: null, destination: null, month: defaultMonth(), returnMonth: "" });
  const [query, setQuery] = useState(null); // { origin, destination, month, returnMonth, refresh, at }
  const [formError, setFormError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [flash, showFlash] = useFlash();

  const searches = useApi(() => adminApi.flightSearches(), []);
  const offers = useApi(
    () =>
      query
        ? adminApi.listFlightOffers({
            origin: query.origin,
            destination: query.destination,
            month: query.month,
            returnMonth: query.returnMonth || undefined,
            refresh: query.refresh || undefined,
          })
        : Promise.resolve(null),
    [query]
  );

  function show(next, refresh = false) {
    setForm(next);
    if (!next.origin || !next.destination) {
      setFormError("Choisissez les deux villes dans la liste.");
      return;
    }
    setFormError(null);
    setQuery({
      origin: next.origin.code,
      destination: next.destination.code,
      month: next.month,
      returnMonth: next.returnMonth || null,
      refresh,
      at: Date.now(),
    });
  }

  function replace(updated) {
    offers.setData((data) => data && { ...data, items: data.items.map((o) => (o.id === updated.id ? updated : o)) });
  }

  async function toggleHidden(offer) {
    try {
      const updated = await adminApi.updateFlightOffer(offer.id, { hidden: !offer.hidden });
      replace(updated);
      showFlash(updated.hidden ? "Billet masqué aux clients." : "Billet de nouveau visible.");
    } catch (err) {
      showFlash(errorMessage(err), "danger");
    }
  }

  const data = offers.data;

  return (
    <>
      <p className="text-sm text-muted mb-3">
        Les clients voient le prix exact d&apos;Aviasales (converti dans votre devise). Sur chaque billet, vous pouvez
        changer les bagages inclus, ajouter une précision ou le masquer.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          show(form);
        }}
        className="border border-line rounded-2xl bg-white p-4 mb-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <CityInput label="Départ" value={form.origin} onChange={(origin) => setForm((f) => ({ ...f, origin }))} placeholder="Ex. Moscou" />
          <CityInput label="Arrivée" value={form.destination} onChange={(destination) => setForm((f) => ({ ...f, destination }))} placeholder="Ex. Abidjan" />
          <div className="sm:w-44 shrink-0">
            <label htmlFor="admin-flight-month" className="block text-[13px] font-bold mb-1.5">Mois</label>
            <select
              id="admin-flight-month"
              value={form.month}
              onChange={(e) => {
                const month = e.target.value;
                // Le retour ne peut pas être avant l'aller
                setForm((f) => ({ ...f, month, returnMonth: f.returnMonth && f.returnMonth < month ? month : f.returnMonth }));
              }}
              className={inputClass}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:w-44 shrink-0">
            <label htmlFor="admin-flight-return" className="block text-[13px] font-bold mb-1.5">Retour</label>
            <select
              id="admin-flight-return"
              value={form.returnMonth}
              onChange={(e) => setForm((f) => ({ ...f, returnMonth: e.target.value }))}
              className={inputClass}
            >
              <option value="">Aller simple</option>
              {months
                .filter((m) => m.value >= form.month)
                .map((m) => (
                  <option key={m.value} value={m.value}>Retour en {m.label.toLowerCase()}</option>
                ))}
            </select>
          </div>
          <button type="submit" className={`${btnPrimary} sm:mt-6.5 shrink-0`}>
            <Search size={16} /> Afficher
          </button>
        </div>
        {formError && <div role="alert" className="text-xs text-danger font-semibold mt-2">{formError}</div>}
      </form>

      {/* Trajets recherchés par les clients : un clic pour les afficher */}
      {searches.data?.items.length > 0 && (
        <div className="mb-4">
          <div className="text-[13px] font-bold mb-1.5">Trajets recherchés par les clients</div>
          <div className="flex gap-2 flex-wrap">
            {searches.data.items.map((s) => (
              <button
                key={`${s.origin.code}-${s.destination.code}-${s.month}-${s.returnMonth ?? ""}`}
                type="button"
                onClick={() => show({ origin: s.origin, destination: s.destination, month: s.month, returnMonth: s.returnMonth ?? "" })}
                className="border border-line rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold bg-white hover:border-ink transition"
              >
                {flightRouteLabel(s.origin.name, s.destination.name, Boolean(s.returnMonth))} · {monthsLabel(s.month, s.returnMonth)}
                <span className="text-muted font-normal"> · {plural(s.requests, "recherche")}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {offers.error && <ErrorState error={offers.error} onRetry={offers.reload} />}
      {offers.loading && !data && query && <Loader label="Chargement des prix Aviasales…" />}

      {data && (
        <div className={`pb-6 transition-opacity ${offers.loading ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap justify-between items-end gap-2 mb-2">
            <div>
              <h2 className="text-lg font-extrabold">
                {flightRouteLabel(data.origin.name, data.destination.name, Boolean(data.returnMonth))} ·{" "}
                {monthsLabel(data.month, data.returnMonth)}
              </h2>
              <p className="text-xs text-muted">
                {plural(data.items.length, "billet")}
                {data.fetchedAt && ` · prix Aviasales reçus ${timeAgo(data.fetchedAt)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                show(
                  form.origin && form.destination
                    ? form
                    : { ...form, origin: data.origin, destination: data.destination, month: data.month, returnMonth: data.returnMonth ?? "" },
                  true
                )
              }
              disabled={offers.loading}
              className={`${btnOutline} ${btnSm}`}
            >
              <RotateCw size={14} /> Actualiser les prix
            </button>
          </div>

          {data.fetchError && <Notice tone="warn">Aviasales n&apos;a pas répondu : {data.fetchError}</Notice>}

          {data.items.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">
              Aucun billet {data.returnMonth ? "aller-retour " : ""}pour ce trajet et ce mois. Aviasales ne garde que les
              prix vus récemment par ses utilisateurs.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.items.map((offer) => (
                <OfferRow key={offer.id} offer={offer} onEdit={setEditing} onToggleHidden={toggleHidden} />
              ))}
              <p className="text-xs text-muted">* valeur fixée à la main sur ce billet.</p>
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditOfferModal
          offer={editing}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            replace(updated);
            setEditing(null);
            showFlash("Billet modifié.");
          }}
        />
      )}
      <Toast flash={flash} />
    </>
  );
}
