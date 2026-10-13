// Échappe % et _ pour une recherche ILIKE "contient"
export function likePattern(text) {
  if (!text) return null;
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

// Égalité insensible à la casse avec ILIKE (sans jokers) : "abidjan" = "Abidjan"
export function exactPattern(text) {
  if (!text) return null;
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * Construit "col1 = $1, col2 = $2" pour un UPDATE partiel.
 * `columns` est une LISTE BLANCHE { cléJS: "colonne_sql" } : aucun nom de colonne
 * ne vient de l'utilisateur, seules les valeurs passent en paramètres → pas d'injection SQL.
 */
export function buildSetClause(fields, columns) {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (fields[key] === undefined) continue;
    values.push(fields[key]);
    sets.push(`${column} = $${values.length}`);
  }
  return { sql: sets.join(", "), values };
}
