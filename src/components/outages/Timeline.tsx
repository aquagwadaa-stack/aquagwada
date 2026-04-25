import type { Outage } from "@/lib/queries/outages";
import type { Forecast } from "@/lib/queries/forecasts";
import { StatusBadge } from "./StatusBadge";
import { SourceBadge } from "./SourceBadge";
import { formatHM, formatDuration, durationBetween } from "@/lib/format";
import { Clock, Sparkles, TrendingDown, TrendingUp, Minus, Lock, MapPin, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";

function TrendBadge({ trend }: { trend: Forecast["trend"] }) {
  if (trend === "improving") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 border border-success/40 px-1.5 py-0.5 text-[10px] font-medium text-success">
        <TrendingDown className="h-3 w-3" /> en amélioration
      </span>
    );
  }
  if (trend === "worsening") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/40 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
        <TrendingUp className="h-3 w-3" /> en aggravation
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Minus className="h-3 w-3" /> stable
    </span>
  );
}

function outageEndForTimeline(o: Outage, endOfDay: Date): Date {
  if (o.ends_at) return new Date(o.ends_at);
  const start = new Date(o.starts_at).getTime();
  const startOfDay = new Date(endOfDay); startOfDay.setHours(0, 0, 0, 0);
  if (o.status === "ongoing" && start < startOfDay.getTime()) return endOfDay;
  const estimatedMinutes = o.estimated_duration_minutes ?? 180;
  return new Date(Math.min(endOfDay.getTime(), start + estimatedMinutes * 60_000));
}

function outageEndLabel(o: Outage, end: Date): string {
  return o.ends_at ? formatHM(o.ends_at) : `~${formatHM(end)}`;
}

function segmentPosition(startMs: number, endMs: number, startOfDay: Date, endOfDay: Date, minWidth = 1.5) {
  const dayMs = endOfDay.getTime() - startOfDay.getTime();
  const clippedStart = Math.max(startMs, startOfDay.getTime());
  const clippedEnd = Math.min(endMs, endOfDay.getTime());
  if (clippedEnd <= startOfDay.getTime() || clippedStart >= endOfDay.getTime() || clippedEnd <= clippedStart) return null;
  const left = ((clippedStart - startOfDay.getTime()) / dayMs) * 100;
  const width = Math.max(minWidth, ((clippedEnd - clippedStart) / dayMs) * 100);
  return { left: Math.max(0, left), width: Math.min(100 - Math.max(0, left), width) };
}

function forecastWindowForTimeline(f: Forecast, startOfDay: Date, endOfDay: Date) {
  const [sh = 8, sm = 0] = (f.window_start ?? "08:00:00").split(":").map(Number);
  const [eh = 10, em = 0] = (f.window_end ?? "10:00:00").split(":").map(Number);
  const startMs = startOfDay.getTime() + (sh * 60 + sm) * 60_000;
  let endMs = startOfDay.getTime() + (eh * 60 + em) * 60_000;
  if (endMs <= startMs) endMs += 24 * 60 * 60_000;
  return segmentPosition(startMs, endMs, startOfDay, endOfDay);
}

/**
 * Regroupe les coupures qui partagent exactement le même créneau (même start/end)
 * pour éviter d'empiler 3 barres identiques quand seuls les secteurs changent.
 */
type GroupedOutage = {
  key: string;
  commune_id: string;
  starts_at: string;
  ends_at: string | null;
  status: Outage["status"];
  source: Outage["source"];
  estimated_duration_minutes: number | null;
  reliability_score: number;
  sectors: string[];
  count: number;
  primary: Outage;
};

function groupOutagesByWindow(items: Outage[]): GroupedOutage[] {
  const map = new Map<string, GroupedOutage>();
  for (const o of items) {
    const start = new Date(o.starts_at).getTime();
    const end = o.ends_at ? new Date(o.ends_at).getTime() : null;
    const key = `${o.commune_id}|${start}|${end ?? "open"}`;
    const existing = map.get(key);
    const sector = (o.sector ?? "").trim();
    if (existing) {
      if (sector && !existing.sectors.includes(sector)) existing.sectors.push(sector);
      existing.count++;
      // garde la coupure la plus fiable comme primaire
      if ((o.reliability_score ?? 0) > (existing.reliability_score ?? 0)) {
        existing.primary = o;
        existing.reliability_score = o.reliability_score;
      }
    } else {
      map.set(key, {
        key,
        commune_id: o.commune_id,
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        status: o.status,
        source: o.source,
        estimated_duration_minutes: o.estimated_duration_minutes,
        reliability_score: o.reliability_score ?? 0,
        sectors: sector ? [sector] : [],
        count: 1,
        primary: o,
      });
    }
  }
  return [...map.values()];
}

/**
 * Calcule un layout en "lanes" : les éléments qui se chevauchent sont
 * empilés verticalement au lieu de se superposer.
 * Renvoie pour chaque clé l'index de lane et le nombre total de lanes.
 */
function computeLanes<T extends { key: string; startMs: number; endMs: number }>(items: T[]): {
  laneOf: Map<string, number>;
  laneCount: number;
} {
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();
  for (const it of sorted) {
    let placed = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= it.startMs) { placed = i; break; }
    }
    if (placed === -1) { laneEnds.push(it.endMs); placed = laneEnds.length - 1; }
    else laneEnds[placed] = it.endMs;
    laneOf.set(it.key, placed);
  }
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

/** Affiche les coupures d'une journée sous forme de timeline horaire. */
export function DayTimeline({
  date,
  outages,
  forecasts = [],
  showForecasts = false,
  lockedAfterNow = false,
  lockedCtaText = "Essai gratuit Pro 7 jours · sans engagement",
  lockedCtaTo = "/abonnements",
  teaserPercentOfRest = 0.2,
  teaserHours = 1,
  communes,
  emptyCtaTo = "/ma-commune",
  emptyCtaLabel = "Ajouter votre commune",
}: {
  date: Date;
  outages: Outage[];
  forecasts?: Forecast[];
  showForecasts?: boolean;
  /**
   * Si true (et qu'on est aujourd'hui), masque visuellement la timeline
   * passé un petit teaser après "maintenant", avec un overlay CTA.
   * Les jours futurs sont entièrement verrouillés.
   */
  lockedAfterNow?: boolean;
  lockedCtaText?: string;
  lockedCtaTo?: string;
  /** (Déprécié) Fraction du reste du jour visible après "maintenant" (0..1). Ignoré si teaserHours est défini. */
  teaserPercentOfRest?: number;
  /** Nombre d'heures de visibilité après "maintenant" avant le verrouillage (par défaut 1h). */
  teaserHours?: number;
  /**
   * Mode multi-communes : si fourni, affiche une ligne horizontale par commune,
   * dans l'ordre, même si aucune coupure / prévision pour la journée.
   * Si vide ([]), affiche un bloc CTA "ajouter une commune".
   */
  communes?: Array<{ id: string; name: string }>;
  emptyCtaTo?: string;
  emptyCtaLabel?: string;
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

  // Calcule le point de coupure visuelle pour le mode verrouillé
  let lockFromPct: number | null = null;
  if (lockedAfterNow) {
    if (isFuture) {
      lockFromPct = 0; // verrouillage complet
    } else if (isToday && nowOffset !== null) {
      // Fenêtre de teaser fixe en heures (1h par défaut), convertie en % du jour.
      const teaserPct = (Math.max(0, teaserHours) * 60 * 60_000 / dayMs) * 100;
      lockFromPct = Math.min(100, nowOffset + teaserPct);
    }
  }

  // Mode multi-communes : on rend une ligne par commune (même vide).
  const multiMode = Array.isArray(communes);
  const hourTicks = Array.from({ length: 23 }, (_, i) => i + 1); // 1..23

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

      {multiMode && communes!.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-8 text-center">
          <MapPin className="h-6 w-6 mx-auto text-primary mb-2" />
          <p className="text-sm font-medium">Ajoutez votre commune favorite pour voir vos timelines</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Une ligne par commune, vue d'ensemble en un coup d'œil.</p>
          <Link
            to={emptyCtaTo}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> {emptyCtaLabel}
          </Link>
        </div>
      ) : (
      <div className="relative">
        {/* échelle horaire */}
        <div className="relative h-6 border-b border-border/60" style={multiMode ? { marginLeft: 96 } : undefined}>
          {hours.filter((h) => h % 3 === 0).map((h) => (
            <span key={h} className="absolute -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, "0")}h
            </span>
          ))}
        </div>
        {/* lignes verticales */}
        <div className="relative mt-2 space-y-2" style={multiMode ? { marginLeft: 96 } : undefined}>
          {/* pointillés horaires (toutes les heures) très discrets */}
          <div className="pointer-events-none absolute inset-y-0 inset-x-0 z-0">
            {hourTicks.map((h) => (
              <span
                key={`tick-${h}`}
                className="absolute top-0 bottom-0 border-l border-dashed border-border/30"
                style={{ left: `${(h / 24) * 100}%` }}
              />
            ))}
          </div>
          {nowOffset !== null && (
            <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${nowOffset}%` }}>
              <div className="h-full w-px bg-primary" />
              <div className="absolute -top-1 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">maintenant</div>
            </div>
          )}

          {!multiMode && outages.length === 0 && dailyForecasts.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {isFuture ? "Aucune prévision de coupure pour cette date." : "Aucune coupure programmée ou détectée."}
            </div>
          )}

          {/* Mode classique : on rend toutes les coupures empilées */}
          {!multiMode && (() => {
            const grouped = groupOutagesByWindow(outages);
            const layoutItems = grouped.map((g) => {
              const s = new Date(g.starts_at).getTime();
              const end = outageEndForTimeline(g.primary, endOfDay);
              return { key: `o-${g.key}`, startMs: s, endMs: end.getTime(), g };
            });
            const { laneOf, laneCount } = computeLanes(layoutItems);
            const laneHeight = 48;
            const totalHeight = Math.max(laneHeight, laneCount * laneHeight + (laneCount - 1) * 6);
            return (
              <div className="relative" style={{ height: totalHeight }}>
                {layoutItems.map(({ key, g }) => {
                  const s = new Date(g.starts_at).getTime();
                  const end = outageEndForTimeline(g.primary, endOfDay);
                  const segment = segmentPosition(s, end.getTime(), startOfDay, endOfDay, 2);
                  if (!segment) return null;
                  const lane = laneOf.get(key) ?? 0;
                  const top = lane * (laneHeight + 6);
                  const tone =
                    g.status === "ongoing" ? "bg-destructive/15 border-destructive/40"
                      : g.status === "resolved" ? "bg-success/10 border-success/40"
                      : g.status === "cancelled" ? "bg-muted border-border"
                      : "bg-warning/15 border-warning/50";
                  const sectorLabel = g.sectors.length === 0
                    ? (g.primary.cause || g.primary.description || "Coupure")
                    : g.sectors.length <= 2
                      ? `Secteur${g.sectors.length > 1 ? "s" : ""} ${g.sectors.join(", ")}`
                      : `${g.sectors.length} secteurs concernés`;
                  return (
                    <div
                      key={key}
                      className={`absolute rounded-md border ${tone} p-1.5 overflow-hidden`}
                      style={{ left: `${segment.left}%`, width: `${segment.width}%`, top, height: laneHeight }}
                    >
                      <div className="flex items-center gap-2 text-[11px] font-medium truncate">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{formatHM(g.starts_at)}–{outageEndLabel(g.primary, end)}</span>
                        {g.primary.commune?.name && <span className="text-muted-foreground hidden sm:inline">· {g.primary.commune.name}</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{sectorLabel}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Forecasts (jaune, dashed) — mode classique */}
          {!multiMode && dailyForecasts.length > 0 && (() => {
            const items = dailyForecasts.map((f) => {
              const seg = forecastWindowForTimeline(f, startOfDay, endOfDay);
              if (!seg) return null;
              const startMs = startOfDay.getTime() + (seg.left / 100) * dayMs;
              const endMs = startMs + (seg.width / 100) * dayMs;
              return { key: `f-${f.id}`, startMs, endMs, f, seg };
            }).filter((x): x is NonNullable<typeof x> => x !== null);
            const { laneOf, laneCount } = computeLanes(items);
            const laneHeight = 48;
            const totalHeight = Math.max(laneHeight, laneCount * laneHeight + (laneCount - 1) * 6);
            return (
              <div className="relative" style={{ height: totalHeight }}>
                {items.map(({ key, f, seg }) => {
                  const lane = laneOf.get(key) ?? 0;
                  const top = lane * (laneHeight + 6);
                  const intensity = f.probability >= 0.7 ? "bg-warning/25 border-warning/60" : "bg-warning/10 border-warning/40";
                  return (
                    <div
                      key={key}
                      className={`absolute rounded-md border-2 border-dashed ${intensity} p-1.5 overflow-hidden`}
                      style={{ left: `${seg.left}%`, width: `${seg.width}%`, top, height: laneHeight }}
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
                  );
                })}
              </div>
            );
          })()}

          {/* Mode multi-communes : une ligne par commune favorite */}
          {multiMode && communes!.map((c) => {
            const cOutagesRaw = outages.filter((o) => o.commune_id === c.id);
            const cOutages = groupOutagesByWindow(cOutagesRaw);
            const cForecasts = dailyForecasts.filter((f) => f.commune_id === c.id);
            const isEmpty = cOutages.length === 0 && cForecasts.length === 0;

            // Compute lanes : on mélange coupures + prévisions et on les empile.
            const layoutItems: Array<{ key: string; startMs: number; endMs: number; type: "outage" | "forecast"; ref: GroupedOutage | Forecast }> = [];
            for (const g of cOutages) {
              const s = new Date(g.starts_at).getTime();
              const end = outageEndForTimeline(g.primary, endOfDay);
              layoutItems.push({ key: `o-${g.key}`, startMs: s, endMs: end.getTime(), type: "outage", ref: g });
            }
            for (const f of cForecasts) {
              const seg = forecastWindowForTimeline(f, startOfDay, endOfDay);
              if (!seg) continue;
              const startMs = startOfDay.getTime() + (seg.left / 100) * dayMs;
              const endMs = startMs + (seg.width / 100) * dayMs;
              layoutItems.push({ key: `f-${f.id}`, startMs, endMs, type: "forecast", ref: f });
            }
            const { laneOf, laneCount } = computeLanes(layoutItems);
            const laneHeight = 22; // px
            const rowHeight = Math.max(40, laneCount * laneHeight + (laneCount - 1) * 4 + 8);

            return (
              <div key={c.id} className="relative group" style={{ height: rowHeight }}>
                {/* Étiquette commune (en dehors du conteneur scaled grâce au marginLeft parent) */}
                <div className="absolute right-full top-0 bottom-0 w-24 -ml-0 flex items-center pr-2 text-[11px] font-medium truncate text-foreground/80" style={{ marginRight: 0 }}>
                  <span className="truncate">{c.name}</span>
                </div>
                {/* Fond de ligne discret */}
                <div className="absolute inset-0 rounded-md bg-muted/20" />
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-muted-foreground/70 italic">
                      {isFuture ? "Aucune prévision" : "Pas de coupure"}
                    </span>
                  </div>
                )}
                {cOutages.map((g) => {
                  const s = new Date(g.starts_at).getTime();
                  const end = outageEndForTimeline(g.primary, endOfDay);
                  const e = end.getTime();
                  const segment = segmentPosition(s, e, startOfDay, endOfDay);
                  if (!segment) return null;
                  const lane = laneOf.get(`o-${g.key}`) ?? 0;
                  const top = 4 + lane * (laneHeight + 4);
                  const tone =
                    g.status === "ongoing" ? "bg-destructive/25 border-destructive/50"
                      : g.status === "resolved" ? "bg-success/20 border-success/50"
                      : g.status === "cancelled" ? "bg-muted border-border"
                      : "bg-warning/25 border-warning/50";
                  const sectorLabel = g.sectors.length === 0
                    ? ""
                    : g.sectors.length <= 2
                      ? ` · ${g.sectors.join(", ")}`
                      : ` · ${g.sectors.length} secteurs`;
                  return (
                    <div
                      key={g.key}
                      className={`absolute rounded border ${tone} px-1 overflow-hidden flex items-center`}
                      style={{ left: `${segment.left}%`, width: `${segment.width}%`, top, height: laneHeight }}
                      title={`${formatHM(g.starts_at)}–${outageEndLabel(g.primary, end)}${sectorLabel}`}
                    >
                      <span className="text-[10px] font-medium truncate">
                         {formatHM(g.starts_at)}–{outageEndLabel(g.primary, end)}{sectorLabel}
                      </span>
                    </div>
                  );
                })}
                {cForecasts.map((f) => {
                  const segment = forecastWindowForTimeline(f, startOfDay, endOfDay);
                  if (!segment) return null;
                  const lane = laneOf.get(`f-${f.id}`) ?? 0;
                  const top = 4 + lane * (laneHeight + 4);
                  const intensity = f.probability >= 0.7 ? "bg-warning/25 border-warning/60" : "bg-warning/10 border-warning/40";
                  return (
                    <div
                      key={f.id}
                      className={`absolute rounded border border-dashed ${intensity} px-1 overflow-hidden flex items-center`}
                      style={{ left: `${segment.left}%`, width: `${segment.width}%`, top, height: laneHeight }}
                      title={`Prévision ${Math.round(f.probability * 100)}% · ${f.basis ?? ""}`}
                    >
                      <span className="text-[10px] font-medium truncate flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{f.window_start?.slice(0, 5)}–{f.window_end?.slice(0, 5)}</span>
                        <span className="ml-auto pl-1 font-semibold text-warning-foreground/90">{Math.round(f.probability * 100)}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Overlay verrouillage : voile flouté + CTA */}
          {lockFromPct !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 z-20 flex items-stretch"
              style={{ left: `${lockFromPct}%`, right: 0 }}
            >
              <div className="relative w-full overflow-hidden rounded-md border border-dashed border-primary/30 bg-gradient-to-r from-background/60 via-background/85 to-background/95 backdrop-blur-[3px]">
                <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center">
                  <Lock className="h-4 w-4 text-primary" />
                  <p className="text-[11px] font-semibold leading-tight">
                    {isFuture ? "Prévisions Pro" : "Reste de la journée"}
                  </p>
                  <Link
                    to={lockedCtaTo}
                    className="text-[10px] font-medium text-primary underline underline-offset-2 hover:no-underline"
                  >
                    {lockedCtaText}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {!multiMode && outages.length > 0 && (
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

      {!multiMode && dailyForecasts.length > 0 && (
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
              <TrendBadge trend={f.trend} />
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