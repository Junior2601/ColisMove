import Sqids from "sqids";

// Identifiants opaques dans les URL : /voyage/12 → /voyage/Xk9mP2qA
// ⚠️ Même alphabet que backend/src/utils/hashid.js
const sqids = new Sqids({ alphabet: "mZw6rTUP3ebvu8iFEna4DWxtG7loLYQfqVJMIpHkhjsCOyA0XgcBz59dRS2NK1", minLength: 8 });

export const encodeId = (id) => sqids.encode([Number(id)]);

// Code de l'URL → identifiant ; null si le code est invalide ou modifié à la main
export function decodeId(hash) {
  if (!hash) return null;
  const [id] = sqids.decode(hash);
  return id !== undefined && sqids.encode([id]) === hash ? id : null;
}

export const paths = {
  trip: (id) => `/voyage/${encodeId(id)}`,
  conversation: (id) => `/messages/${encodeId(id)}`,
  tripReservations: (base, tripId) => `${base}?voyage=${encodeId(tripId)}`,
};