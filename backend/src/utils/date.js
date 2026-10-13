const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// "2026-07-25 08:45:00" (PostgreSQL) → "2026-07-25T08:45" (format <input type="datetime-local">)
export function toLocalIso(value) {
  return value ? String(value).replace(" ", "T").slice(0, 16) : null;
}

// "2026-07-25T08:45" → "sam. 25 juil." (sans conversion de fuseau)
export function formatLocalDate(localIso) {
  return dayFormatter.format(new Date(`${localIso.slice(0, 16)}:00Z`));
}

// Date du jour "AAAA-MM-JJ"
export const todayIso = () => new Date().toISOString().slice(0, 10);
