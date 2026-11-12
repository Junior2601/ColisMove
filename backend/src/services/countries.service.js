/**
 * Liste de tous les pays : nom en français, indicatif téléphonique, drapeau.
 * Source : jeu de données ouvert « world-countries » (mledoze/countries, celui sur lequel REST Countries est construit),
 * servi par le CDN jsDelivr, sans clé. Téléchargé une fois puis gardé en mémoire 7 jours ;
 * si le CDN ne répond pas, la dernière liste connue reste servie.
 */
import { AppError } from "../utils/AppError.js";

const SOURCE_URL = "https://cdn.jsdelivr.net/npm/world-countries@5/countries.json";
const TIMEOUT_MS = 15_000;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000; // après un échec, si une liste est déjà en mémoire
const FIRST_RETRY_MS = 30 * 1000; // après un échec, si aucune liste n'a encore été chargée

// Zones à indicatif partagé (+1 Amérique du Nord, +7 Russie/Kazakhstan) : l'indicatif est la racine seule.
// Deux territoires dont les données donnent un indicatif trop long.
const ROOT_ONLY = new Set(["+1", "+7"]);
const DIAL_CODE_FIXES = { EH: "212", VA: "39" };

// { root: "+2", suffixes: ["25"] } → "225" (null : pas d'indicatif, ex. Antarctique)
function dialCodeOf(row) {
  if (DIAL_CODE_FIXES[row.cca2]) return DIAL_CODE_FIXES[row.cca2];
  const { root, suffixes = [] } = row.idd ?? {};
  if (!root) return null;
  const code = ROOT_ONLY.has(root) || !suffixes.length ? root : `${root}${suffixes[0]}`;
  return code.replace(/\D/g, "") || null;
}

let state = { items: null, byCode: new Map(), expires: 0, loading: null };

async function load() {
  const response = await fetch(SOURCE_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  const items = (Array.isArray(rows) ? rows : [])
    .filter((row) => /^[A-Z]{2}$/.test(row.cca2 ?? ""))
    .map((row) => ({
      code: row.cca2, // ISO 3166-1 alpha-2 : "CI"
      name: row.translations?.fra?.common ?? row.name?.common ?? row.cca2, // "Côte d'Ivoire"
      dialCode: dialCodeOf(row), // "225"
      flag: row.flag ?? "", // "🇨🇮"
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  if (items.length < 200) throw new Error(`liste incomplète (${items.length} pays)`);
  state = { items, byCode: new Map(items.map((country) => [country.code, country])), expires: Date.now() + REFRESH_MS, loading: null };
}

async function ensureLoaded() {
  if (state.expires > Date.now()) return;
  state.loading ??= load().catch((err) => {
    console.error("[pays] chargement de la liste", err.message);
    state = { ...state, expires: Date.now() + (state.items ? RETRY_MS : FIRST_RETRY_MS), loading: null };
  });
  await state.loading;
}

/** [{ code: "CI", name: "Côte d'Ivoire", dialCode: "225", flag: "🇨🇮" }, …] triés par nom */
export async function listCountries() {
  await ensureLoaded();
  if (!state.items) throw new AppError(503, "La liste des pays est momentanément indisponible. Réessayez dans un instant.");
  return state.items;
}

/**
 * "CI" → { code: "CI", name: "Côte d'Ivoire", … } ; null si le code n'existe pas.
 * Liste indisponible : on ne bloque pas la demande, le code sert de nom.
 */
export async function countryByCode(code) {
  await ensureLoaded();
  if (!state.items) return { code, name: code, dialCode: null, flag: "" };
  return state.byCode.get(code) ?? null;
}
