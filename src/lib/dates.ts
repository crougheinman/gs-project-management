// Calendar-date helpers (YYYY-MM-DD), all math in UTC so the local timezone
// offset can never shift a date across midnight.

export function startOfDayUTC(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`);
}

export function shiftDate(dateStr: string, days: number) {
  const d = startOfDayUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whole days from a to b (b - a). Same date -> 0; b after a -> positive.
export function daysBetween(a: string, b: string) {
  const ms = startOfDayUTC(b).getTime() - startOfDayUTC(a).getTime();
  return Math.round(ms / 86_400_000);
}

// Today as YYYY-MM-DD in the viewer's local zone (what a user means by "today").
export function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
