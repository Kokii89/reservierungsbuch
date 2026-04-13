export const toISO = (v: number | string | null | undefined) =>
  v ? new Date(v as any).toISOString() : null;

export const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });

export function since(ts?: number | string | null) {
  if (!ts) return "–";
  const d = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(d / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function formatTime(ts?: number | string | null) {
  if (ts === null || typeof ts === "undefined") return "";
  const d = new Date(ts as any);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function minutesSince(ts?: number | string | null) {
  if (!ts) return 0;
  const d = Date.now() - new Date(ts).getTime();
  return Math.floor(d / 60000);
}

export function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}