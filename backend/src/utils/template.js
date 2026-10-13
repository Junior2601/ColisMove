const VARIABLE_REGEX = /\{(\w+)\}/g;

// Remplace {kilos}, {trajet}… par les valeurs fournies (les variables inconnues restent telles quelles)
export function interpolate(template, data) {
  return template.replace(VARIABLE_REGEX, (match, key) => (data[key] ?? match).toString());
}

// Liste des variables présentes dans un modèle : "Bonjour {nom}" → ["nom"]
export function extractVariables(template) {
  return [...new Set([...template.matchAll(VARIABLE_REGEX)].map((m) => m[1]))];
}
