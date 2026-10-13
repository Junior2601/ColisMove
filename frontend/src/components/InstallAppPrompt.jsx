import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BellRing, Copy, Download, MoreVertical, Share, SquarePlus, X, Zap } from "lucide-react";
import { btnOutline, btnPrimary, btnSm } from "./ui";
import { useConsent } from "../context/ConsentContext";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { isMobile } from "../lib/pwa";

const SNOOZE_KEY = "movecolis_install_prompt";
const SNOOZE_DAYS = 7; // "Plus tard" : on repropose une semaine après

function isSnoozed() {
  const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
  return Date.now() < until;
}

export const BENEFITS = [
  { icon: BellRing, text: "Notifications des messages et de chaque étape de vos colis, même appli fermée" },
  { icon: Zap, text: "Ouverture en un geste depuis l'écran d'accueil, en plein écran" },
  { icon: Download, text: "Rien à télécharger sur un store : l'appli pèse moins d'un Mo" },
];

/** Étapes d'installation adaptées à l'appareil (aussi utilisées par la page /application) */
export function InstallSteps({ ios, android, inApp }) {
  if (inApp) {
    return (
      <p className="text-[13px]">
        Vous êtes dans le navigateur d'une autre application (Facebook, Instagram…), qui ne permet pas
        l'installation. Ouvrez ce lien dans <b>{ios ? "Safari" : "Chrome"}</b> : menu <b>⋯</b> puis{" "}
        <b>« Ouvrir dans le navigateur »</b>.
      </p>
    );
  }
  if (ios) {
    return (
      <ol className="text-[13px] space-y-1.5">
        <li className="flex items-center gap-2">
          <span className="font-bold">1.</span> Touchez <Share size={16} className="text-[#1D72F3]" /> <b>Partager</b> en bas de Safari
        </li>
        <li className="flex items-center gap-2">
          <span className="font-bold">2.</span> Choisissez <SquarePlus size={16} /> <b>« Sur l'écran d'accueil »</b>
        </li>
        <li className="flex items-center gap-2">
          <span className="font-bold">3.</span> Ouvrez <b>MoveColis</b> depuis l'icône et activez les notifications
        </li>
      </ol>
    );
  }
  return (
    <ol className="text-[13px] space-y-1.5">
      <li className="flex items-center gap-2">
        <span className="font-bold">1.</span> Ouvrez le menu <MoreVertical size={16} /> du navigateur
      </li>
      <li className="flex items-center gap-2">
        <span className="font-bold">2.</span> Touchez <b>« Installer l'application »</b>
        {android && <span className="text-muted">ou « Ajouter à l'écran d'accueil »</span>}
      </li>
      <li className="flex items-center gap-2">
        <span className="font-bold">3.</span> Ouvrez <b>MoveColis</b> depuis l'icône et activez les notifications
      </li>
    </ol>
  );
}

/**
 * Invitation à installer l'appli (PWA) sur téléphone, pour profiter des notifications.
 * Apparaît quelques secondes après l'arrivée, une fois les cookies réglés, jamais dans l'appli installée.
 */
export default function InstallAppPrompt() {
  const { decided } = useConsent();
  const location = useLocation();
  const { installed, canInstall, ios, android, inApp, install } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (installed || !decided || !isMobile() || isSnoozed()) return;
    const timer = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(timer);
  }, [installed, decided]);

  if (!visible || installed || location.pathname === "/application") return null;

  function later() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    setVisible(false);
  }

  async function handleInstall() {
    if (await install()) setVisible(false);
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(window.location.origin).catch(() => {});
    setCopied(true);
  }

  return (
    <div
      role="dialog"
      aria-label="Installer l'application MoveColis"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[64] flex justify-center lg:hidden"
    >
      <div className="w-full max-w-md bg-white border border-line-light rounded-2xl shadow-card-hover p-4">
        <div className="flex items-start gap-3">
          <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[15px]">Installez l'application MoveColis</div>
            <div className="text-[12.5px] text-muted">Gratuit · pour une meilleure expérience des notifications</div>
          </div>
          <button type="button" onClick={later} aria-label="Fermer" className="text-muted p-0.5">
            <X size={18} />
          </button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {BENEFITS.slice(0, 2).map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2 text-[13px]">
              <Icon size={16} className="text-primary shrink-0 mt-0.5" /> {text}
            </li>
          ))}
        </ul>

        {!canInstall && (
          <div className="bg-surface rounded-xl px-3.5 py-3 mt-3">
            <InstallSteps ios={ios} android={android} inApp={inApp} />
          </div>
        )}

        <div className="flex gap-2 mt-3.5">
          <button type="button" onClick={later} className={`${btnOutline} ${btnSm} flex-1`}>
            Plus tard
          </button>
          {canInstall ? (
            <button type="button" onClick={handleInstall} className={`${btnPrimary} ${btnSm} flex-1`}>
              <Download size={15} /> Installer
            </button>
          ) : inApp ? (
            <button type="button" onClick={copyLink} className={`${btnPrimary} ${btnSm} flex-1`}>
              <Copy size={15} /> {copied ? "Lien copié" : "Copier le lien"}
            </button>
          ) : (
            <Link to="/application" onClick={() => setVisible(false)} className={`${btnPrimary} ${btnSm} flex-1`}>
              Voir le guide
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
