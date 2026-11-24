// =========================================================
//  Liens internes (notifications) : un chemin du site, jamais un autre site
//  Même règle que backend/src/utils/url.js : refuse "https://…", "//autre-site.com", "/\autre-site.com"
// =========================================================

export function isInternalPath(link) {
  // eslint-disable-next-line no-control-regex -- caractères de contrôle refusés exprès
  return typeof link === "string" && /^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/.test(link);
}

/** Le lien s'il est interne, sinon l'accueil */
export const safeInternalPath = (link, fallback = "/") => (isInternalPath(link) ? link : fallback);
