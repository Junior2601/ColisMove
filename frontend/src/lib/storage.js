/**
 * Renomme une clé du stockage local en gardant sa valeur
 * (ex. "kilofly_token" → "movecolis_token" : personne n'est déconnecté par le changement de nom).
 */
export function migrateStorageKey(oldKey, newKey) {
  try {
    const value = localStorage.getItem(oldKey);
    if (value !== null && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, value);
    localStorage.removeItem(oldKey);
  } catch {
    // stockage indisponible (navigation privée stricte) : sans gravité
  }
}
