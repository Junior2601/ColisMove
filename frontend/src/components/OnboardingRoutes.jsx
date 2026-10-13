import { useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, CircleCheck, MapPin, Plus, X } from "lucide-react";
import RouteFields, { CitySuggestions } from "./RouteFields";
import { ErrorState, btnOutline, btnPrimary, btnSm } from "./ui";
import { marketingApi } from "../api/marketing";
import { errorMessage } from "../api/client";
import { usePushNotifications } from "../hooks/usePushNotifications";

const LATER_KEY = "movecolis_onboarding_later";
const LATER_DAYS = 7;
const EMPTY_ROUTE = { departureCity: "", arrivalCity: "" };

export const onboardingPostponed = () => Date.now() < Number(localStorage.getItem(LATER_KEY) || 0);

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary shrink-0" />
      <span>{children}</span>
    </label>
  );
}

/**
 * Accueil d'un nouveau client : « Où envoyez-vous vos colis ? »
 * Ses destinations favorites alimentent la sélection de la semaine et les alertes de trajets.
 */
export default function OnboardingRoutes({ onDone, onLater }) {
  const [routes, setRoutes] = useState([EMPTY_ROUTE]);
  const [routeAlerts, setRouteAlerts] = useState(true);
  const [campaigns, setCampaigns] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const push = usePushNotifications();

  const filled = routes.filter((r) => r.arrivalCity.trim());

  async function handleSubmit(e) {
    e.preventDefault();
    if (!filled.length) return setError("Indiquez au moins une destination.");
    setSubmitting(true);
    setError(null);
    try {
      const favorites = filled.map((r) => ({ departureCity: r.departureCity.trim() || null, arrivalCity: r.arrivalCity.trim() }));
      setResult(await marketingApi.completeOnboarding({ favorites, routeAlerts, campaigns }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function later() {
    localStorage.setItem(LATER_KEY, String(Date.now() + LATER_DAYS * 86400000));
    onLater?.();
  }

  /* ===== Après l'enregistrement : ce qui part cette semaine + activation des notifications ===== */
  if (result) {
    const best = result.weekTrips?.[0];
    const destination = best?.destination ?? filled[0]?.arrivalCity.trim();
    return (
      <div className="border border-line-light rounded-2xl bg-white p-5 mt-4">
        <div className="flex items-start gap-3">
          <CircleCheck size={22} className="text-success shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-extrabold text-[15px]">C'est noté !</div>
            {best ? (
              <>
                Des voyageurs partent vers <b>{best.destination}</b> cette semaine :{" "}
                <b>{best.trips} voyage{best.trips > 1 ? "s" : ""}</b> disponible{best.trips > 1 ? "s" : ""}.
              </>
            ) : (
              <>Nous vous préviendrons dès qu'un voyageur part vers <b>{destination}</b>.</>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3.5">
          {best && (
            <Link to={`/?vers=${encodeURIComponent(best.destination)}`} className={`${btnPrimary} ${btnSm}`}>
              Voir les voyages
            </Link>
          )}
          {push.status === "disabled" && (
            <button type="button" onClick={push.enable} disabled={push.busy} className={`${best ? btnOutline : btnPrimary} ${btnSm}`}>
              <BellRing size={15} /> Être alerté sur mon téléphone
            </button>
          )}
          <button type="button" onClick={onDone} className={`${btnOutline} ${btnSm} border-line!`}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  /* ===== Formulaire ===== */
  return (
    <form onSubmit={handleSubmit} className="border border-line-light rounded-2xl bg-white p-5 mt-4">
      <CitySuggestions />
      <div className="flex justify-between items-start gap-3 mb-1">
        <h2 className="flex items-center gap-2 text-[16px] font-extrabold">
          <MapPin size={18} className="text-primary" /> Où envoyez-vous vos colis ?
        </h2>
        <button type="button" onClick={later} aria-label="Plus tard" className="text-muted p-0.5">
          <X size={18} />
        </button>
      </div>
      <p className="text-[13px] text-muted mb-3.5">
        Indiquez vos trajets habituels : nous vous prévenons dès qu'un voyageur part dans cette direction.
      </p>

      <div className="flex flex-col gap-2">
        {routes.map((route, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1">
              <RouteFields value={route} autoFocus={i === 0} onChange={(next) => setRoutes((list) => list.map((r, j) => (j === i ? next : r)))} />
            </div>
            {routes.length > 1 && (
              <button type="button" onClick={() => setRoutes((list) => list.filter((_, j) => j !== i))} aria-label="Retirer ce trajet" className="text-muted p-1">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      {routes.length < 3 && (
        <button type="button" onClick={() => setRoutes((list) => [...list, EMPTY_ROUTE])} className="inline-flex items-center gap-1 text-[13px] font-bold underline mt-2">
          <Plus size={14} /> Ajouter un trajet
        </button>
      )}

      <div className="flex flex-col gap-2 mt-4">
        <Toggle checked={routeAlerts} onChange={setRouteAlerts}>
          M'alerter quand un voyageur part sur ces trajets, et me rappeler les départs proches
        </Toggle>
        <Toggle checked={campaigns} onChange={setCampaigns}>
          Recevoir les bons plans des périodes fortes (fêtes, Tabaski, rentrée…)
        </Toggle>
      </div>
      <p className="text-xs text-muted mt-2">Au plus 1 notification par jour, jamais la nuit. Modifiable à tout moment dans votre profil.</p>

      {error && <ErrorState message={error} />}

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={later} className={`${btnOutline} ${btnSm} border-line!`}>
          Plus tard
        </button>
        <button type="submit" disabled={submitting} className={`${btnPrimary} ${btnSm} flex-1`}>
          {submitting ? "Enregistrement…" : "Enregistrer mes trajets"}
        </button>
      </div>
    </form>
  );
}
