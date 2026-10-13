import { useState } from "react";
import { BellRing, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { btnPrimary, btnSm } from "./ui";

const DISMISS_KEY = "movecolis_push_prompt_dismissed";

/**
 * Bandeau discret invitant à activer les notifications (comptes connectés uniquement).
 * Sur iPhone, il faut d'abord installer le site sur l'écran d'accueil : InstallAppPrompt s'en charge.
 * Une fois fermé, il ne réapparaît plus (les réglages restent dans Profil).
 */
export default function NotificationPrompt() {
  const { user } = useAuth();
  const push = usePushNotifications();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  // (iPhone sans installation : c'est l'invitation à installer l'appli qui prend le relais)
  if (!user || dismissed || push.status !== "disabled") return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="flex items-start gap-3 rounded-xl bg-[#FEEFE7] text-ink px-4 py-3 mt-4 text-[13.5px]">
      <BellRing size={18} className="text-primary shrink-0 mt-0.5" />
      <div className="flex-1">
        <b>Ne manquez rien :</b> soyez prévenu des nouveaux messages et de chaque étape de vos colis, même
        quand MoveColis est fermé.
        {push.error && <div className="text-danger font-semibold mt-1">{push.error}</div>}
        <div className="mt-2">
          <button type="button" onClick={push.enable} disabled={push.busy} className={`${btnPrimary} ${btnSm}`}>
            {push.busy ? "Activation…" : "Activer les notifications"}
          </button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Fermer" className="text-muted p-0.5 shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
