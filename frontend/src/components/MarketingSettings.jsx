import { useState } from "react";
import { Plus, X } from "lucide-react";
import RouteFields, { CitySuggestions } from "./RouteFields";
import { ErrorState, Loader, btnOutline, btnSm } from "./ui";
import { marketingApi } from "../api/marketing";
import { errorMessage } from "../api/client";
import { useApi } from "../hooks/useApi";

function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-line-light last:border-0 cursor-pointer">
      <span>
        <span className="block font-semibold text-sm">{label}</span>
        <span className="block text-xs text-muted mt-0.5">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-5 h-5 accent-primary shrink-0"
      />
    </label>
  );
}

/**
 * Section « Mes alertes » du profil.
 * Client : trajets favoris + alertes trajets + campagnes. Voyageur : campagnes seulement.
 */
export default function MarketingSettings({ user }) {
  const { data, loading, error, reload, setData } = useApi(() => marketingApi.get(), []);
  const [draft, setDraft] = useState({ departureCity: "", arrivalCity: "" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const isClient = user.role === "CLIENT";

  async function run(action) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await action());
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <div className="border border-line-light rounded-2xl bg-white overflow-hidden mb-3">
        {isClient && (
          <Switch
            label="Alertes trajets et rappels de départ"
            description="Un voyageur part sur un trajet qui vous intéresse, un départ approche, la sélection de la semaine."
            checked={data.routeAlerts}
            disabled={busy}
            onChange={(routeAlerts) => run(() => marketingApi.updatePreferences({ routeAlerts }))}
          />
        )}
        <Switch
          label="Bons plans des périodes fortes"
          description={
            isClient
              ? "Fêtes de fin d'année, Ramadan, Tabaski, vacances, rentrée."
              : "Conseils pour publier vos voyages aux périodes de forte demande."
          }
          checked={data.campaigns}
          disabled={busy}
          onChange={(campaigns) => run(() => marketingApi.updatePreferences({ campaigns }))}
        />
      </div>
      <p className="text-xs text-muted mb-4">
        Au plus 1 notification de ce type par jour et 3 par semaine, jamais entre 21 h et 8 h (heure de votre appareil). Les
        messages et les étapes de vos colis ne sont pas concernés.
      </p>

      {isClient && (
        <div className="border border-line-light rounded-2xl bg-white p-4 mb-5">
          <CitySuggestions />
          <div className="font-semibold text-sm mb-2">Mes trajets favoris</div>
          {data.favorites.length === 0 ? (
            <p className="text-[13px] text-muted mb-3">Aucun trajet favori pour l'instant.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 mb-3">
              {data.favorites.map((f) => (
                <li key={f.id} className="inline-flex items-center gap-1.5 bg-surface rounded-full pl-3 pr-1.5 py-1.5 text-[13px] font-semibold">
                  {f.departureCity ? `${f.departureCity} → ` : "→ "}
                  {f.arrivalCity}
                  <button type="button" disabled={busy} onClick={() => run(() => marketingApi.removeFavorite(f.id))} aria-label={`Retirer ${f.arrivalCity}`} className="text-muted p-0.5">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.favorites.length < 5 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.arrivalCity.trim()) return;
                run(async () => {
                  const next = await marketingApi.addFavorite({
                    departureCity: draft.departureCity.trim() || null,
                    arrivalCity: draft.arrivalCity.trim(),
                  });
                  setDraft({ departureCity: "", arrivalCity: "" });
                  return next;
                });
              }}
              className="flex items-center gap-2"
            >
              <div className="flex-1">
                <RouteFields value={draft} onChange={setDraft} />
              </div>
              <button type="submit" disabled={busy || !draft.arrivalCity.trim()} aria-label="Ajouter ce trajet" className={`${btnOutline} ${btnSm} py-3!`}>
                <Plus size={16} />
              </button>
            </form>
          )}
        </div>
      )}

      {actionError && <ErrorState message={actionError} />}
    </>
  );
}
