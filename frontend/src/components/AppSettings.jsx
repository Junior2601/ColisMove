import { BellOff, BellRing, CircleCheck, Download, Share } from "lucide-react";
import { Link } from "react-router-dom";
import { Notice, btnOutline, btnPrimary, btnSm } from "./ui";
import { useAuth } from "../context/AuthContext";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { usePushNotifications } from "../hooks/usePushNotifications";

/* ===== Installation de l'appli sur l'écran d'accueil ===== */
function InstallRow() {
  const { installed, canInstall, ios, install } = useInstallPrompt();

  let content;
  if (installed) {
    content = (
      <span className="flex items-center gap-1.5 text-success font-semibold">
        <CircleCheck size={16} /> MoveColis est installé sur cet appareil.
      </span>
    );
  } else if (canInstall) {
    content = (
      <button type="button" onClick={install} className={`${btnPrimary} ${btnSm}`}>
        <Download size={15} /> Installer l'application
      </button>
    );
  } else if (ios) {
    content = (
      <span className="text-muted">
        Dans Safari, touchez <Share size={14} className="inline -mt-0.5" /> <b className="text-ink">Partager</b> puis{" "}
        <b className="text-ink">« Sur l'écran d'accueil »</b>.
      </span>
    );
  } else {
    content = (
      <span className="text-muted">
        Ouvrez le menu de votre navigateur puis <b className="text-ink">« Installer l'application »</b> ou{" "}
        <b className="text-ink">« Ajouter à l'écran d'accueil »</b>.
      </span>
    );
  }

  return (
    <div className="px-4 py-3.5 border-b border-line-light">
      <div className="font-semibold text-sm mb-1.5">Application sur l'écran d'accueil</div>
      <div className="text-[13px]">{content}</div>
    </div>
  );
}

/* ===== Notifications push sur cet appareil ===== */
const STATUS_TEXT = {
  loading: "Vérification…",
  "ios-install": "Sur iPhone et iPad, installez d'abord MoveColis sur l'écran d'accueil, puis ouvrez-le depuis l'icône pour activer les notifications.",
  unsupported: "Ce navigateur ne permet pas de recevoir des notifications. Essayez Chrome, Edge, Firefox ou Safari récent.",
  "server-disabled": "Les notifications push ne sont pas encore configurées sur le serveur.",
  denied: "Notifications bloquées : autorisez-les pour ce site dans les réglages du navigateur ou du téléphone, puis revenez ici.",
  disabled: "Recevez une alerte pour chaque nouveau message et chaque étape de vos colis, même quand MoveColis est fermé.",
  enabled: "Activées sur cet appareil : vous êtes prévenu même quand MoveColis est fermé.",
};

function PushRow() {
  const { user } = useAuth();
  const push = usePushNotifications();

  // Les notifications push sont liées à un compte (messages, réservations, colis)
  if (!user) {
    return (
      <div className="px-4 py-3.5">
        <div className="font-semibold text-sm mb-1.5 flex items-center gap-1.5">
          <BellOff size={16} className="text-muted" /> Notifications sur cet appareil
        </div>
        <p className="text-[13px] text-muted">
          <Link to="/connexion" className="font-bold underline text-ink">Connectez-vous</Link> pour recevoir les
          notifications de vos messages et de vos colis.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3.5">
      <div className="font-semibold text-sm mb-1.5 flex items-center gap-1.5">
        {push.status === "enabled" ? <BellRing size={16} className="text-success" /> : <BellOff size={16} className="text-muted" />}
        Notifications sur cet appareil
      </div>
      <p className="text-[13px] text-muted">{STATUS_TEXT[push.status]}</p>

      {push.status === "disabled" && (
        <button type="button" onClick={push.enable} disabled={push.busy} className={`${btnPrimary} ${btnSm} mt-2.5`}>
          <BellRing size={15} /> {push.busy ? "Activation…" : "Activer les notifications"}
        </button>
      )}
      {push.status === "enabled" && (
        <button type="button" onClick={push.disable} disabled={push.busy} className={`${btnOutline} ${btnSm} mt-2.5`}>
          <BellOff size={15} /> {push.busy ? "Désactivation…" : "Désactiver sur cet appareil"}
        </button>
      )}
      {push.error && <Notice tone="danger">{push.error}</Notice>}
    </div>
  );
}

/** Section "Application et notifications" de la page Profil */
export default function AppSettings() {
  return (
    <div className="border border-line-light rounded-2xl bg-white overflow-hidden mb-5">
      <InstallRow />
      <PushRow />
    </div>
  );
}
