import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, PlaneTakeoff, PlaneLanding, Repeat, Weight } from "lucide-react";
import Layout from "../../components/Layout";
import { ErrorState, Field, Loader, Notice, inputClass, btnPrimary, btnOutline } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../api/admin";
import { voyageurApi } from "../../api/voyageur";
import { errorMessage, fieldErrors } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { formatKg, formatMoney, formatTripDate, joinLocal, routeLabel } from "../../lib/format";
import { formatDuration, removedBagsLabel, stopCitiesText } from "../../lib/flights";
import { decodeId } from "../../lib/hashid";

// Devises proposées (le backend accepte tout code ISO à 3 lettres)
const CURRENCIES = ["XOF", "XAF", "EUR", "RUB", "USD"];

// État initial du formulaire
const initial = {
  departureCity: "", departureDate: "", departureTime: "",
  arrivalCity: "", arrivalDate: "", arrivalTime: "",
  hasStop: false, stopCity: "", stopDuration: "",
  kilosTotal: "", pricePerKilo: "", currency: "XOF",
};

/**
 * Formulaire pré-rempli avec les kilos libérés sur un billet vendu (valises retirées par le client) :
 * départ, arrivée (heure locale donnée par Aviasales) et villes d'escale. Aviasales ne donne pas le temps
 * d'escale : l'admin le recopie depuis le billet. Demande ancienne sans heure d'arrivée : date estimée
 * (départ + durée du vol, sans le décalage horaire), heure à compléter.
 */
function formFromFreedKilos({ flight, bags, currency }) {
  const estimatedDate = flight.durationMinutes
    ? new Date(new Date(`${flight.departureAt}:00Z`).getTime() + flight.durationMinutes * 60000).toISOString().slice(0, 10)
    : "";
  return {
    ...initial,
    departureCity: flight.origin.name,
    departureDate: flight.departureAt.slice(0, 10),
    departureTime: flight.departureAt.slice(11, 16),
    arrivalCity: flight.destination.name,
    arrivalDate: flight.arrivalAt ? flight.arrivalAt.slice(0, 10) : estimatedDate,
    arrivalTime: flight.arrivalAt ? flight.arrivalAt.slice(11, 16) : "",
    hasStop: flight.transfers > 0,
    stopCity: stopCitiesText(flight.stops).slice(0, 80),
    kilosTotal: String(bags.freedKilos),
    currency: CURRENCIES.includes(currency) ? currency : initial.currency,
  };
}

// Erreurs de l'API sur departureAt / arrivalAt → affichées sous le champ date correspondant
const FIELD_FOR_API_ERROR = { departureAt: "departureDate", arrivalAt: "arrivalDate" };

// Date du jour dans le fuseau du navigateur, format "AAAA-MM-JJ" (pour l'attribut min des dates)
const today = () => new Date().toLocaleDateString("en-CA");

// "3H 20" → "3h20", "3h" → "3h00" (format attendu par l'API)
const normalizeDuration = (value) =>
  value.replace(/\s+/g, "").toLowerCase().replace(/^(\d{1,2})h$/, "$1h00");

// Formulaire → corps de la requête POST (dates locales "AAAA-MM-JJTHH:mm")
function toPayload(form) {
  return {
    departureCity: form.departureCity.trim(),
    departureAt: joinLocal(form.departureDate, form.departureTime),
    stopCity: form.hasStop ? form.stopCity.trim() : null,
    stopDuration: form.hasStop ? normalizeDuration(form.stopDuration) : null,
    arrivalCity: form.arrivalCity.trim(),
    arrivalAt: joinLocal(form.arrivalDate, form.arrivalTime),
    kilosTotal: Number(form.kilosTotal),
    pricePerKilo: Number(form.pricePerKilo),
    currency: form.currency,
  };
}

// Titre de section avec icône corail
function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-extrabold mb-3 mt-2 first:mt-0">
      <Icon size={17} className="text-primary" /> {children}
    </h2>
  );
}

export default function CreateTrip() {
  const { user } = useAuth();
  const isAdmin = user.role === "ADMIN";
  const layoutVariant = isAdmin ? "admin" : "traveler";

  // Admin : publication des kilos libérés sur un billet (/publier?billet=Xk9mP2qA, depuis « Kilos disponibles »)
  const [params, setParams] = useSearchParams();
  const flightOrderId = isAdmin ? decodeId(params.get("billet")) : null;
  const freedKilos = useApi(
    () => (flightOrderId ? adminApi.getFreedKilos(flightOrderId) : Promise.resolve(null)),
    [flightOrderId]
  );
  const source = flightOrderId ? freedKilos.data : null; // demande de billet dont on publie les kilos

  const [form, setForm] = useState(initial);
  const [prefilledFrom, setPrefilledFrom] = useState(null);
  if (source && prefilledFrom !== source.id) {
    setPrefilledFrom(source.id);
    setForm(formFromFreedKilos(source));
  }
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [published, setPublished] = useState(null); // voyage créé → écran de succès

  // Un seul setter pour tous les champs ; modifier un champ efface son erreur
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((errs) => ({ ...errs, [k]: undefined }));
  };

  // Estimation affichée sous les prix : ce que rapporte le voyage si tout est vendu
  const estimatedTotal =
    Number(form.kilosTotal) > 0 && Number(form.pricePerKilo) > 0
      ? formatMoney(Number(form.kilosTotal) * Number(form.pricePerKilo), form.currency)
      : null;

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = toPayload(form);

    // Vérification immédiate, sans attendre le serveur
    if (payload.arrivalAt <= payload.departureAt) {
      setErrors({ arrivalDate: "L'arrivée doit être postérieure au départ." });
      return;
    }

    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      // Même formulaire, endpoint selon le rôle : le voyage appartient à l'utilisateur connecté
      const trip = isAdmin
        ? await adminApi.createTrip(source ? { ...payload, flightOrderId: source.id } : payload)
        : await voyageurApi.createTrip(payload);
      setPublished(trip);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const byField = Object.fromEntries(
        Object.entries(fieldErrors(err)).map(([field, message]) => [FIELD_FOR_API_ERROR[field] ?? field, message])
      );
      setErrors(byField);
      // Erreurs métier sans champ (ex. "La date de départ est déjà passée.") → bannière
      setFormError(Object.keys(byField).length ? "Vérifiez les champs signalés en rouge." : errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  /* ===== Écran de succès ===== */
  if (published) {
    return (
      <Layout variant={layoutVariant}>
        <div className="max-w-md mx-auto pt-10 pb-14 text-center">
          <CircleCheck size={44} className="mx-auto text-success mb-3" />
          <h1 className="text-[21px] font-extrabold mb-1">Voyage publié !</h1>
          <p className="text-muted text-[13.5px] mb-6">
            {routeLabel(published)} · {formatTripDate(published.departureAt)} ·{" "}
            {published.kilosTotal} kg à {formatMoney(published.pricePerKilo, published.currency)}/kg.
            Il apparaît maintenant dans la liste des voyages proposés aux clients.
          </p>
          <div className="flex flex-col gap-2.5">
            {source && (
              <Link to="/admin/billets?onglet=kilos" className={`${btnPrimary} w-full`}>
                Retour aux kilos disponibles
              </Link>
            )}
            <Link to={isAdmin ? "/admin/voyages" : "/voyageur/voyages"} className={source ? `${btnOutline} w-full` : `${btnPrimary} w-full`}>
              Voir mes voyages
            </Link>
            <button
              type="button"
              onClick={() => {
                setForm(initial);
                setPublished(null);
                if (source) setParams({}); // le voyage suivant ne reprend pas les mêmes kilos
              }}
              className={`${btnOutline} w-full`}
            >
              Publier un autre voyage
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout variant={layoutVariant}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Publier un voyage</h1>
        <p className="text-muted text-sm mb-4">
          Renseignez votre itinéraire et le nombre de kilos que vous vendez.
          Les heures sont celles indiquées sur votre billet (heure locale de chaque ville).
        </p>

        {flightOrderId && freedKilos.loading && !source && <Loader label="Chargement des kilos libérés…" />}
        {freedKilos.error && <ErrorState error={freedKilos.error} onRetry={freedKilos.reload} />}
        {source && (
          <Notice>
            <b>Kilos libérés sur le billet {source.reference}</b> ({source.clientName},{" "}
            {source.flight.airlineName} {source.flight.airline} {source.flight.flightNumber}) :{" "}
            {removedBagsLabel(source.bags.removed)}, soit <b>{formatKg(source.bags.freedKilos)}</b>. Le vol est
            pré-rempli
            {source.flight.durationMinutes ? ` (${formatDuration(source.flight.durationMinutes)} de trajet au total)` : ""}.{" "}
            {!source.flight.arrivalAt && "Complétez l'heure d'arrivée (heure locale) avec le billet. "}
            {source.flight.transfers > 0 &&
              (source.flight.transfers > 1
                ? "Indiquez le temps d'escale total, écrit sur le billet (Aviasales ne le donne pas). "
                : "Indiquez le temps d'escale, écrit sur le billet (Aviasales ne le donne pas). ")}
            Fixez ensuite le prix par kilo.
          </Notice>
        )}

        <form onSubmit={handleSubmit} className="border border-line rounded-2xl p-5 bg-white mb-8">

          {/* ===== Départ ===== */}
          <SectionTitle icon={PlaneTakeoff}>Départ</SectionTitle>
          <Field label="Ville de départ" error={errors.departureCity}>
            <input value={form.departureCity} onChange={set("departureCity")} required
              placeholder="Ex. Abidjan" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date de départ" error={errors.departureDate}>
              <input value={form.departureDate} onChange={set("departureDate")} required
                type="date" min={today()} className={inputClass} />
            </Field>
            <Field label="Heure de départ">
              <input value={form.departureTime} onChange={set("departureTime")} required
                type="time" className={inputClass} />
            </Field>
          </div>

          {/* ===== Arrivée ===== */}
          <SectionTitle icon={PlaneLanding}>Arrivée</SectionTitle>
          <Field label="Ville d'arrivée" error={errors.arrivalCity}>
            <input value={form.arrivalCity} onChange={set("arrivalCity")} required
              placeholder="Ex. Moscou" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date d'arrivée" error={errors.arrivalDate}>
              <input value={form.arrivalDate} onChange={set("arrivalDate")} required
                type="date" min={form.departureDate || today()} className={inputClass} />
            </Field>
            <Field label="Heure d'arrivée">
              <input value={form.arrivalTime} onChange={set("arrivalTime")} required
                type="time" className={inputClass} />
            </Field>
          </div>

          {/* ===== Escale (optionnelle, toggle) ===== */}
          <div className="flex items-center justify-between gap-3 py-1 pb-3.5">
            <div>
              <div className="flex items-center gap-2 font-extrabold text-[15px]">
                <Repeat size={17} className="text-primary" /> Mon vol a une escale
              </div>
              <div className="text-xs text-muted mt-0.5">Activez si votre vol n'est pas direct.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.hasStop}
              aria-label="Vol avec escale"
              onClick={() => {
                setForm((f) => ({ ...f, hasStop: !f.hasStop }));
                setErrors((errs) => ({ ...errs, stopCity: undefined, stopDuration: undefined }));
              }}
              className={`relative w-12 h-7 rounded-full transition shrink-0 ${
                form.hasStop ? "bg-ink" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-[3px] left-[3px] w-5.5 h-5.5 rounded-full bg-white shadow transition-transform ${
                  form.hasStop ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {form.hasStop && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ville d'escale" error={errors.stopCity}>
                <input value={form.stopCity} onChange={set("stopCity")} required
                  placeholder="Ex. Istanbul" className={inputClass} />
              </Field>
              <Field label="Temps d'escale" error={errors.stopDuration} hint="Format : 3h20">
                <input value={form.stopDuration} onChange={set("stopDuration")} required
                  placeholder="Ex. 3h20" className={inputClass} />
              </Field>
            </div>
          )}

          {/* ===== Kilos & prix ===== */}
          <SectionTitle icon={Weight}>Kilos &amp; prix</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <Field label="Kilos disponibles" error={errors.kilosTotal}>
              <input value={form.kilosTotal} onChange={set("kilosTotal")} required
                type="number" min="0.5" max="9999" step="0.5" placeholder="Ex. 23" className={inputClass} />
            </Field>
            <Field
              label="Prix par kilo"
              error={errors.pricePerKilo ?? errors.currency}
              hint="XOF et XAF = francs CFA."
            >
              <div className="flex gap-2">
                <input value={form.pricePerKilo} onChange={set("pricePerKilo")} required
                  type="number" min="0" step="any" placeholder="Ex. 9500" className={`${inputClass} min-w-0`} />
                <select value={form.currency} onChange={set("currency")} aria-label="Devise"
                  className={`${inputClass} w-auto! px-2.5!`}>
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            </Field>
          </div>

          {estimatedTotal && (
            <p className="text-[13px] text-muted -mt-1 mb-4">
              Si tout est vendu : <b className="text-ink">{estimatedTotal}</b>
            </p>
          )}

          {formError && <Notice tone="danger">{formError}</Notice>}

          <button type="submit" disabled={submitting} className={`${btnPrimary} w-full mt-1`}>
            {submitting ? "Publication…" : "Publier le voyage"}
          </button>
          <p className="text-xs text-muted text-center mt-3">
            Les clients réservent via la messagerie MoveColis : vous recevrez leurs demandes
            directement dans votre espace.
          </p>
        </form>
      </div>
    </Layout>
  );
}
