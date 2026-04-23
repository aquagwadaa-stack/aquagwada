import type { Outage } from "@/lib/queries/outages";
import { StatusBadge } from "./StatusBadge";
import { SourceBadge } from "./SourceBadge";
import { formatHM, formatDuration, durationBetween } from "@/lib/format";
import { Clock } from "lucide-react";

/** Affiche les coupures d'une journée sous forme de timeline horaire. */
export function DayTimeline({ date, outages }: { date: Date; outages: Outage[] }) {
  const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
  const dayMs = endOfDay.getTime() - startOfDay.getTime();

  const hours = Array.from({ length: 25 }, (_, i) => i);
  const isToday = new Date().toDateString() === date.toDateString();
  const nowOffset = isToday ? ((Date.now() - startOfDay.getTime()) / dayMs) * 100 : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold">
          {date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </h3>
        <span className="text-xs text-muted-foreground">{outages.length} coupure{outages.length > 1 ? "s" : ""}</span>
      </div>

      <div className="relative">
        {/* échelle horaire */}
        <div className="relative h-6 border-b border-border/60">
          {hours.filter((h) => h % 3 === 0).map((h) => (
            <span key={h} className="absolute -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, "0")}h
            </span>
          ))}
        </div>
        {/* lignes verticales */}
        <div className="relative mt-2 space-y-2">
          {nowOffset !== null && (
            <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${nowOffset}%` }}>
              <div className="h-full w-px bg-primary" />
              <div className="absolute -top-1 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">maintenant</div>
            </div>
          )}

          {outages.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Aucune coupure programmée ou détectée.
            </div>
          )}

          {outages.map((o) => {
            const s = new Date(o.starts_at).getTime();
            const e = o.ends_at
              ? new Date(o.ends_at).getTime()
              : Math.min(endOfDay.getTime(), s + (o.estimated_duration_minutes ?? 120) * 60_000);
            const left = Math.max(0, ((s - startOfDay.getTime()) / dayMs) * 100);
            const widthPct = Math.max(2, ((e - Math.max(s, startOfDay.getTime())) / dayMs) * 100);
            const tone =
              o.status === "ongoing" ? "bg-destructive/15 border-destructive/40"
                : o.status === "resolved" ? "bg-success/10 border-success/40"
                : o.status === "cancelled" ? "bg-muted border-border"
                : "bg-warning/15 border-warning/50";
            return (
              <div key={o.id} className="relative h-12">
                <div className={`absolute top-0 h-full rounded-md border ${tone} p-1.5 overflow-hidden`} style={{ left: `${left}%`, width: `${Math.min(100 - left, widthPct)}%` }}>
                  <div className="flex items-center gap-2 text-[11px] font-medium truncate">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formatHM(o.starts_at)}{o.ends_at ? `–${formatHM(o.ends_at)}` : " · fin inconnue"}</span>
                    {o.commune?.name && <span className="text-muted-foreground hidden sm:inline">· {o.commune.name}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {o.sector || o.cause || o.description || "Coupure"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {outages.length > 0 && (
        <ul className="mt-4 divide-y divide-border/60">
          {outages.map((o) => (
            <li key={o.id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge status={o.status} />
              <span className="font-medium">
                {formatHM(o.starts_at)} → {o.ends_at ? formatHM(o.ends_at) : <span className="text-muted-foreground italic">heure de retour estimée</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                durée {formatDuration(durationBetween(o.starts_at, o.ends_at) ?? o.estimated_duration_minutes)}
              </span>
              {o.commune?.name && <span className="ml-auto text-xs text-muted-foreground">{o.commune.name}{o.sector ? ` · ${o.sector}` : ""}</span>}
              <SourceBadge source={o.source} score={o.reliability_score} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}