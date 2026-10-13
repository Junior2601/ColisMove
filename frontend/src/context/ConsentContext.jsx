import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Cookie } from "lucide-react";
import { Modal, btnOutline, btnPrimary, btnSm } from "../components/ui";
import { COOKIE_CATEGORIES, OPTIONAL_CATEGORIES } from "../config/cookies";
import { readConsent, writeConsent } from "../lib/consent";
import { applyConsent, clearOptionalCookies, trackPageView, trackersLoaded } from "../lib/trackers";

const ConsentContext = createContext(null);

const allChoices = (value) => Object.fromEntries(OPTIONAL_CATEGORIES.map((c) => [c.key, value]));

/* ===== Interrupteur accessible ===== */
function Switch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative w-11 h-6.5 rounded-full transition shrink-0 disabled:opacity-60 ${checked ? "bg-ink" : "bg-line"}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4.5" : ""
        }`}
      />
    </button>
  );
}

/* ===== Bandeau (premier passage) : refuser est aussi simple qu'accepter ===== */
function CookieBanner({ onAcceptAll, onRejectAll, onCustomize }) {
  return (
    <div
      role="dialog"
      aria-label="Cookies"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-5 z-[65] flex justify-center"
    >
      <div className="w-full max-w-3xl bg-white border border-line-light rounded-2xl shadow-card-hover p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Cookie size={22} className="text-primary shrink-0 mt-0.5" />
          <div className="text-[13.5px]">
            <b className="text-[14.5px]">Votre vie privée compte.</b> MoveColis utilise des cookies indispensables au
            fonctionnement du site et, avec votre accord, des cookies de{" "}
            {OPTIONAL_CATEGORIES.map((c) => c.label.toLowerCase()).join(" et de ")}. Vous pouvez changer d'avis à tout
            moment via « Gérer les cookies » en bas de page.{" "}
            <Link to="/cookies" className="font-bold underline">En savoir plus</Link>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-3.5">
          <button type="button" onClick={onCustomize} className={`${btnOutline} ${btnSm} border-line!`}>
            Personnaliser
          </button>
          <button type="button" onClick={onRejectAll} className={`${btnOutline} ${btnSm}`}>
            Tout refuser
          </button>
          <button type="button" onClick={onAcceptAll} className={`${btnPrimary} ${btnSm}`}>
            Tout accepter
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== Préférences détaillées, catégorie par catégorie ===== */
function CookiePreferences({ initial, onSave, onClose }) {
  const [choices, setChoices] = useState(initial);

  return (
    <Modal open title="Gérer les cookies" onClose={onClose}>
      <p className="text-[13px] text-muted mb-3">
        Choisissez les cookies que vous acceptez. Votre choix est conservé 6 mois.{" "}
        <Link to="/cookies" onClick={onClose} className="font-bold underline text-ink">Politique de cookies</Link>
      </p>

      <div className="border border-line-light rounded-xl overflow-hidden mb-4">
        {COOKIE_CATEGORIES.filter((c) => c.required || c.enabled).map((category) => (
          <div key={category.key} className="px-4 py-3 border-b border-line-light last:border-0">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-sm">{category.label}</span>
              <Switch
                label={category.label}
                checked={category.required || Boolean(choices[category.key])}
                disabled={category.required}
                onChange={(value) => setChoices((c) => ({ ...c, [category.key]: value }))}
              />
            </div>
            <p className="text-xs text-muted mt-1">
              {category.description}
              {category.required && " Toujours actifs."}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button type="button" onClick={() => onSave(allChoices(false))} className={`${btnOutline} ${btnSm}`}>
          Tout refuser
        </button>
        <button type="button" onClick={() => onSave(allChoices(true))} className={`${btnOutline} ${btnSm}`}>
          Tout accepter
        </button>
        <button type="button" onClick={() => onSave(choices)} className={`${btnPrimary} ${btnSm}`}>
          Enregistrer mes choix
        </button>
      </div>
    </Modal>
  );
}

/**
 * Consentement aux cookies :
 *  - le bandeau n'apparaît que si un outil facultatif est configuré (sinon, rien à demander)
 *  - aucun outil n'est chargé avant l'accord ; un refus vaut autant qu'un accord
 *  - "Gérer les cookies" (pied de page) rouvre les préférences à tout moment
 */
export function ConsentProvider({ children }) {
  const location = useLocation();
  const [consent, setConsent] = useState(readConsent);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const needed = OPTIONAL_CATEGORIES.length > 0;
  const decided = !needed || consent !== null;
  const choicesKey = JSON.stringify(consent?.choices ?? {});

  // Charge les outils acceptés (au démarrage, puis à chaque nouveau choix)
  useEffect(() => {
    if (consent) applyConsent(consent.choices);
  }, [consent]);

  // Page vue à chaque changement de page (sans effet tant que rien n'est accepté)
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search, choicesKey]);

  const save = useCallback(
    (choices) => {
      const previous = consent?.choices ?? {};
      const withdrawn = Object.keys(previous).some((key) => previous[key] && !choices[key]);
      setConsent(writeConsent(choices));
      setPreferencesOpen(false);
      // Retrait d'un accord : on efface les cookies déposés et on recharge pour arrêter les scripts
      if (withdrawn && trackersLoaded()) {
        clearOptionalCookies();
        window.location.reload();
      }
    },
    [consent]
  );

  const value = useMemo(
    () => ({
      consent,
      decided,
      needed,
      openPreferences: () => setPreferencesOpen(true),
    }),
    [consent, decided, needed]
  );

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {needed && !consent && !preferencesOpen && (
        <CookieBanner
          onAcceptAll={() => save(allChoices(true))}
          onRejectAll={() => save(allChoices(false))}
          onCustomize={() => setPreferencesOpen(true)}
        />
      )}
      {preferencesOpen && (
        <CookiePreferences
          initial={consent?.choices ?? allChoices(false)}
          onSave={save}
          onClose={() => setPreferencesOpen(false)}
        />
      )}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) throw new Error("useConsent() doit être utilisé à l'intérieur de <ConsentProvider>.");
  return context;
}
