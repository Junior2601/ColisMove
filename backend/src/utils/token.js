import crypto from "node:crypto";

// Jeton aléatoire, lisible dans une URL
export const generateToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");

// On ne stocke que l'empreinte SHA-256 du jeton (comme un mot de passe)
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Compare deux empreintes hexadécimales sans fuite d'information par le temps de réponse
export function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
