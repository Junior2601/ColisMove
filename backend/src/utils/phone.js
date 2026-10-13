// "+225 07 12 34 56 78" → "2250712345678" (chiffres uniquement, format international)
export function normalizePhone(value) {
  if (value === null || value === undefined) return value;
  return String(value).replace(/\D/g, "");
}
