// =========================================================
//  Client HTTP de l'API MoveColis (fetch + token JWT)
// =========================================================

import { migrateStorageKey } from "../lib/storage";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
const TOKEN_KEY = "movecolis_token";
migrateStorageKey("kilofly_token", TOKEN_KEY);

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 = serveur injoignable
    this.details = details; // erreurs de validation champ par champ
  }
}

// Message lisible pour l'utilisateur (détail des champs invalides si présent)
export function errorMessage(err) {
  if (err?.details?.length) return err.details.map((d) => d.message).join(" ");
  return err?.message ?? "Une erreur est survenue.";
}

// [{ field: "email", message: "…" }] → { email: "…" } : pour afficher l'erreur sous chaque champ
export function fieldErrors(err) {
  return Object.fromEntries((err?.details ?? []).filter((d) => d.field).map((d) => [d.field, d.message]));
}

// { a: 1, b: undefined, c: ["X", "Y"] } → "?a=1&c=X%2CY" (valeurs vides ignorées)
function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * body : objet envoyé en JSON · file : Blob envoyé tel quel (photo) · asBlob : réponse lue comme fichier (Blob)
 */
async function request(method, path, { body, file, asBlob = false, query, headers: extraHeaders } = {}) {
  const headers = { Accept: asBlob ? "*/*" : "application/json", ...extraHeaders };
  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (file) headers["Content-Type"] = file.type || "application/octet-stream";

  let response;
  try {
    response = await fetch(`${API_URL}${path}${toQueryString(query)}`, {
      method,
      headers,
      body: file ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, "Impossible de joindre le serveur. Vérifiez votre connexion.");
  }

  if (asBlob && response.ok) return response.blob();
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Session expirée ou compte supprimé : on prévient l'AuthContext pour déconnecter
    if (response.status === 401 && token) {
      tokenStorage.clear();
      window.dispatchEvent(new Event("movecolis:unauthorized"));
    }
    if (response.status === 413) throw new ApiError(413, "Fichier trop lourd.");
    throw new ApiError(response.status, data?.error ?? `Erreur ${response.status}`, data?.details);
  }
  return data;
}

// options : { headers } pour des en-têtes en plus (ex. jeton visiteur de la messagerie)
export const api = {
  get: (path, query, options) => request("GET", path, { query, ...options }),
  post: (path, body, options) => request("POST", path, { body: body ?? {}, ...options }),
  patch: (path, body, options) => request("PATCH", path, { body: body ?? {}, ...options }),
  delete: (path, options) => request("DELETE", path, options),
  // Fichier envoyé tel quel dans le corps (photo), informations en plus dans l'URL
  upload: (path, file, query, options) => request("POST", path, { file, query, ...options }),
  // Fichier protégé (photo de la messagerie) : Blob à afficher avec URL.createObjectURL
  blob: (path, options) => request("GET", path, { asBlob: true, ...options }),
};
