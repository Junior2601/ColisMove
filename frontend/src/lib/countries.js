// =========================================================
//  Pays (nationalité des passagers) et indicatifs téléphoniques
//  Liste fournie par l'API (/public/countries), chargée une fois par visite
// =========================================================

import { flightsApi } from "../api/flights";

// Indicatif proposé par défaut (marché principal de MoveColis)
export const DEFAULT_PHONE_COUNTRY = "CI";

let countriesPromise = null;

/** [{ code: "CI", name: "Côte d'Ivoire", dialCode: "225", flag: "🇨🇮" }, …] triés par nom */
export function loadCountries() {
  countriesPromise ??= flightsApi
    .countries()
    .then((result) => result.items)
    .catch((err) => {
      countriesPromise = null; // nouvel essai au prochain appel
      throw err;
    });
  return countriesPromise;
}

// Indicatif partagé par plusieurs pays : celui qu'on choisit en retrouvant le pays d'un numéro
const MAIN_COUNTRY_FOR_CODE = {
  1: "US", 7: "RU", 39: "IT", 44: "GB", 47: "NO", 61: "AU", 64: "NZ", 212: "MA", 262: "RE", 268: "SZ", 290: "SH", 500: "FK",
  590: "GP", 599: "CW",
};

/** "2250712345678" → { country: "CI", number: "0712345678" } (null si aucun indicatif ne correspond) */
export function splitPhone(phone, countries) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  let best = null;
  for (const country of countries) {
    if (!country.dialCode || !digits.startsWith(country.dialCode)) continue;
    const longer = !best || country.dialCode.length > best.dialCode.length;
    const preferred = best && country.dialCode === best.dialCode && MAIN_COUNTRY_FOR_CODE[country.dialCode] === country.code;
    if (longer || preferred) best = country;
  }
  return best ? { country: best.code, number: digits.slice(best.dialCode.length) } : null;
}

/**
 * { country: "CI", number: "07 12 34 56 78" } → "+225 07 12 34 56 78"
 * Numéro vide → "" ; numéro collé avec son indicatif (+33…, 0033…) → gardé tel quel
 */
export function joinPhone({ country, number }, countries) {
  const value = number.trim();
  if (!value) return "";
  if (/^(\+|00)/.test(value)) return value.replace(/^00/, "+");
  const dialCode = countries.find((c) => c.code === country)?.dialCode ?? "";
  return `+${dialCode} ${value}`;
}
