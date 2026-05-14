export const GUADELOUPE_TIME_ZONE = "America/Guadeloupe";

export function guadeloupeDateTimeToUtc(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function minutesInGuadeloupeDay(value: Date): number {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: GUADELOUPE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function formatGuadeloupeDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: GUADELOUPE_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatGuadeloupeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: GUADELOUPE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
