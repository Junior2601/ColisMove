// =========================================================
//  Consentement aux cookies (stocké sur l'appareil)
// =========================================================
import { CONSENT_DURATION_DAYS, CONSENT_VERSION } from "../config/cookies";

const STORAGE_KEY = "movecolis_consent";

/** Choix enregistré, ou null s'il faut (re)demander : jamais demandé, expiré ou catégories modifiées */
export function readConsent() {
  try {
    const consent = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!consent || consent.version !== CONSENT_VERSION) return null;
    const ageDays = (Date.now() - new Date(consent.savedAt).getTime()) / 86400000;
    return ageDays > CONSENT_DURATION_DAYS ? null : consent;
  } catch {
    return null;
  }
}

/** choices = { analytics: bool, marketing: bool } */
export function writeConsent(choices) {
  const consent = { version: CONSENT_VERSION, savedAt: new Date().toISOString(), choices };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // stockage indisponible : le choix vaut pour la visite en cours
  }
  return consent;
}
