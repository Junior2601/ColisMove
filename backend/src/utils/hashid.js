import Sqids from "sqids";

// Identifiants opaques dans les liens des notifications (même alphabet que frontend/src/lib/hashid.js)
const sqids = new Sqids({ alphabet: "mZw6rTUP3ebvu8iFEna4DWxtG7loLYQfqVJMIpHkhjsCOyA0XgcBz59dRS2NK1", minLength: 8 });

export const encodeId = (id) => sqids.encode([Number(id)]);

export const paths = {
  trip: (id) => `/voyage/${encodeId(id)}`,
  conversation: (id) => `/messages/${encodeId(id)}`,
};
