/**
 * Liens internes (notifications, campagnes) : un chemin du site MoveColis, jamais un autre site.
 * Refusés : "https://…", "//autre-site.com" (lien sans protocole, ouvert comme un autre site par le navigateur),
 * "/\autre-site.com" (le navigateur lit \ comme /), espaces et caractères de contrôle.
 */
export function isInternalPath(link) {
  return typeof link === "string" && /^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/.test(link);
}

/** Le lien s'il est interne, sinon fallback (ex. "/") */
export const safeInternalPath = (link, fallback = "/") => (isInternalPath(link) ? link : fallback);
