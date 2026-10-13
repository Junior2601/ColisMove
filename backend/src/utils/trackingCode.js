import crypto from "node:crypto";

// Sans 0/O ni 1/I pour éviter les confusions à la lecture
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Code de suivi : MC-YYYYMMDD-XXXX (MC = MoveColis)
 * 4 caractères (≈ 1 million de combinaisons par jour) plutôt que 3 (≈ 32 000),
 * pour qu'un code ne se devine pas facilement.
 */
export function generateTrackingCode(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `MC-${ymd}-${suffix}`;
}
