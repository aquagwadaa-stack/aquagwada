import type { Outage } from "@/lib/queries/outages";
import type { Forecast } from "@/lib/queries/forecasts";
import { StatusBadge } from "./StatusBadge";
import { SourceBadge } from "./SourceBadge";
import { formatHM, formatDuration, durationBetween } from "@/lib/format";
import { Clock, Sparkles } from "lucide-react";

/** Affiche les coupures d'une journée sous forme de timeline horaire. */
export function DayTimeline({
  date,
  outages,
  forecasts = [],
  showForecasts = false,
}: {
  date: Date;
  outages: Outage[];
  forecasts?: Forecast[];
  showForecasts?: boolean;
}) {
  const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
  const dayMs = endOfDay.getTime() - startOfDay.getTime();

  const hours = Array.from({ length: 25 }, (_, i) => i);
  const isToday = new Date().toDateString() === date.toDateString();
  const isFuture = startOfDay.getTime() > Date.now();
  const nowOffset = isToday ? ((Date.now() - startOfDay.getTime()) / dayMs) * 100 : null;

  const dailyForecasts = showForecasts
    ? forecasts.filter((f) => f.forecast_date === date.toISOString().slice(0, 10))
    : [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold">
          {date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </h3>
        <span className="text-xs text-muted-foreground">
          {outages.length} coupure{outages.length > 1 ? "s" : ""}
          {dailyForecasts.length > 0 && ` · ${dailyForecasts.length} prévision${dailyForecasts.length > 1 ? "s" : ""}`}
        </span>
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

          {outages.length === 0 && dailyForecasts.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {isFuture ? "Aucune prévision de coupure pour cette date." : "Aucune coupure programmée ou détectée."}
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

          {/* Forecasts (jaune, dashed) */}
          {dailyForecasts.map((f) => {
            const [sh, sm] = (f.window_start ?? "08:00:00").split(":").map(Number);
            const [eh, em] = (f.window_end ?? "10:00:00").split(":").map(Number);
            const startMs = startOfDay.getTime() + (sh * 60 + sm) * 60_000;
            const endMs = startOfDay.getTime() + (eh * 60 + em) * 60_000;
            const left = Math.max(0, ((startMs - startOfDay.getTime()) / dayMs) * 100);
            const widthPct = Math.max(2, ((endMs - startMs) / dayMs) * 100);
            const intensity = f.probability >= 0.7 ? "bg-warning/25 border-warning/60" : "bg-warning/10 border-warning/40";
            return (
              <div key={f.id} className="relative h-12">
                <div
                  className={`absolute top-0 h-full rounded-md border-2 border-dashed ${intensity} p-1.5 overflow-hidden`}
                  style={{ left: `${left}%`, width: `${Math.min(100 - left, widthPct)}%` }}
                  title={f.basis ?? "Prévision"}
                >
                  <div className="flex items-center gap-2 text-[11px] font-medium truncate">
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span>{f.window_start?.slice(0, 5)}–{f.window_end?.slice(0, 5)} · {Math.round(f.probability * 100)}%</span>
                    {f.commune?.name && <span className="text-muted-foreground hidden sm:inline">· {f.commune.name}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    Prévision (confiance {Math.round(f.confidence * 100)}%)
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

      {dailyForecasts.length > 0 && (
        <ul className="mt-4 divide-y divide-border/60">
          {dailyForecasts.map((f) => (
            <li key={f.id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
                <Sparkles className="h-3 w-3" /> Prévision
              </span>
              <span className="font-medium">
                {f.window_start?.slice(0, 5)} → {f.window_end?.slice(0, 5)}
              </span>
              <span className="text-xs text-muted-foreground">
                probabilité {Math.round(f.probability * 100)}% · confiance {Math.round(f.confidence * 100)}%
              </span>
              {f.commune?.name && <span className="ml-auto text-xs text-muted-foreground">{f.commune.name}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sélecteur de jour : aujourd'hui ± N. Style minimal, conforme au design. */
export function DayPicker({
  selected,
  onChange,
  forwardDays = 14,
  backDays = 0,
}: {
  selected: Date;
  onChange: (d: Date) => void;
  forwardDays?: number;
  backDays?: number;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const total = backDays + forwardDays + 1;
  const days = Array.from({ length: total }, (_, i) => {
    const d = new Date(today.getTime() + (i - backDays) * 86400_000);
    return d;
  });
  const selKey = selected.toDateString();

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
      {days.map((d) => {
        const isSel = d.toDateString() === selKey;
        const isToday = d.toDateString() === today.toDateString();
        const isFuture = d.getTime() > today.getTime();
        return (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onChange(d)}
            className={
              "shrink-0 flex flex-col items-center rounded-lg border px-2.5 py-1.5 text-xs transition-colors " +
              (isSel
                ? "bg-primary text-primary-foreground border-primary"
                : isFuture
                ? "border-warning/30 text-foreground hover:bg-warning/10"
                : "border-border text-foreground hover:bg-muted")
            }
          >
            <span className="text-[10px] uppercase tracking-wider opacity-75">
              {isToday ? "Auj." : d.toLocaleDateString("fr-FR", { weekday: "short" })}
            </span>
            <span className="text-sm font-semibold">{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}