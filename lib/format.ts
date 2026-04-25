export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function formatHM(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function durationBetween(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

export function reliabilityLabel(score: number): { label: string; tone: "ok" | "warn" | "low" } {
  if (score >= 0.8) return { label: "Fiable", tone: "ok" };
  if (score >= 0.5) return { label: "Vérifié partiellement", tone: "warn" };
  return { label: "Non confirmé", tone: "low" };
}