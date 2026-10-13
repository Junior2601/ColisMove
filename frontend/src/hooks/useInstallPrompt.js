import { useEffect, useState } from "react";
import {
  canPromptInstall, isAndroid, isInAppBrowser, isIos, isStandalone, onInstallAvailabilityChange, promptInstall,
} from "../lib/pwa";
import { trackEvent } from "../lib/trackers";

/**
 * Installation de l'appli :
 *  - installed  : déjà ouverte depuis l'écran d'accueil
 *  - canInstall : Chrome / Edge / Android proposent l'installation → bouton "Installer"
 *  - ios        : iPhone / iPad → instructions manuelles (Partager → Sur l'écran d'accueil)
 *  - android    : Android sans bouton automatique → menu ⋮ du navigateur
 *  - inApp      : navigateur intégré (Facebook, Instagram…) → il faut ouvrir le lien dans Safari / Chrome
 */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(canPromptInstall);
  useEffect(() => onInstallAvailabilityChange(() => setCanInstall(canPromptInstall())), []);

  async function install() {
    const accepted = await promptInstall();
    if (accepted) trackEvent("app_installed"); // statistique, seulement si la mesure d'audience est acceptée
    return accepted;
  }

  return { installed: isStandalone(), canInstall, ios: isIos(), android: isAndroid(), inApp: isInAppBrowser(), install };
}
