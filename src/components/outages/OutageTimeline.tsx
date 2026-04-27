import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Clock, Lock, MapPin, Plus, Sparkles } from "lucide-react";
import { fetchOutagesWindow, type Outage } from "@/lib/queries/outages";
import { fetchHistoryRange } from "@/lib/queries/history";
import { fetchForecastsRange, type Forecast } from "@/lib/queries/forecasts";
import { canSeeForecasts, PLAN_CAPS, type Tier } from "@/lib/subscription";
import { DayTimeline } from "./Timeline";

export type OutageTimelineMode = "visitor" | "favorites" | "all";

type CommuneLite = { id: string; name: string };

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Frise chronologique unifiée "Coupures au fil du temps".
 * Remplace les anciens blocs Aujourd'hui / Demain / 7 derniers jours / 14 prochains jours.
 *
 * Principe :
 *  - Un ruban horizontal de jours (passé · aujourd'hui · futur) avec flèches.
 *  - Aujourd'hui sélectionné par défaut, en 4ème position visible (3 passés à gauche).
 *  - Selon le jour sélectionné, on charge :
 *      passé   -> outage_history
 *      présent -> outages live
 *      futur   -> forecasts
 *  - Les jours hors fenêtre du plan sont grisés ("Pro") et redirigent vers /abonnements.
 *  - Mode `visitor` : aperçu seulement (aujourd'hui), sans historique ni prévisions cliquables.
 */
export function OutageTimeline({
  tier,
  mode,
  communes,
  visibleCount = 3,
  emptyCommunesCtaLabel = "Ajouter une commune favorite",
  emptyCommunesCtaTo = "/ma-commune",
}: {
  tier: Tier;
  mode: OutageTimelineMode;
  /** Communes utilisées pour les requêtes ET l'affichage en lignes. */
  communes: CommuneLite[];
  /** Nb de cases visibles dans le ruban (par défaut 3). */
  visibleCount?: number;
  emptyCommunesCtaLabel?: string;
  emptyCommunesCtaTo?: string;
}) {
  // Bornes plan
  const caps = PLAN_CAPS[tier];
  const showForecasts = canSeeForecasts(tier);
  // Visiteur (non connecté) : on ne propose que -1, aujourd'hui, +1 (cliquables = aujourd'hui),
  // mais on garde 1 case future "aperçu" sans données réelles -> CTA création de compte.
  const isVisitor = mode === "visitor";
  const backDays = isVisitor ? 1 : 7; // 7 = même fenêtre que le plan free
  const allowedBack = isVisitor ? 0 : caps.historyDays; // jours réellement accessibles
  const forwardDays = isVisitor ? 1 : 14; // total affiché dans le ruban
  const allowedForward = isVisitor ? 0 : caps.forecastDays; // jours réellement accessibles

  // Construction de la liste totale
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const days = useMemo(() => {
    const total = backDays + forwardDays + 1;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(today.getTime() + (i - backDays) * 86400_000);
      return d;
    });
  }, [today, backDays, forwardDays]);

  const todayIndex = backDays;
  const [responsiveVisibleCount, setResponsiveVisibleCount] = useState(visibleCount);
  useEffect(() => {
    if (typeof window === "undefined") return;

    function computeVisibleCount() {
      const width = window.innerWidth;
      if (width >= 1600) return Math.max(visibleCount, 8);
      if (width >= 1280) return Math.max(visibleCount, 7);
      if (width >= 1024) return Math.max(visibleCount, 6);
      if (width >= 640) return Math.max(visibleCount, 4);
      return visibleCount;
    }

    const update = () => setResponsiveVisibleCount(computeVisibleCount());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [visibleCount]);

  const effectiveVisibleCount = Math.min(days.length, Math.max(1, responsiveVisibleCount));
  const [selectedIdx, setSelectedIdx] = useState(todayIndex);
  // Position du curseur de défilement (index de la 1ère case visible).
  // Aujourd'hui doit être en position visible 4 (index 3) -> cursor = todayIndex - 3.
  const preferredTodaySlot = Math.min(3, effectiveVisibleCount - 1);
  const idealCursor = Math.max(0, todayIndex - preferredTodaySlot);
  const [cursor, setCursor] = useState(idealCursor);

  // Le nombre de jours visibles est responsive : compact sur ordinateur, lisible sur mobile.
  const maxCursor = Math.max(0, days.length - effectiveVisibleCount);
  const clampedCursor = Math.min(Math.max(0, cursor), maxCursor);

  function isAccessible(i: number): boolean {
    if (isVisitor) return i === todayIndex;
    const offset = i - todayIndex;
    if (offset === 0) return true;
    if (offset < 0) return Math.abs(offset) <= allowedBack;
    return offset <= allowedForward;
  }

  function handleClickDay(i: number) {
    if (!isAccessible(i)) {
      return;
    }
    setSelectedIdx(i);
  }

  // S'assurer que la case sélectionnée reste visible.
  useEffect(() => {
    if (selectedIdx < clampedCursor) setCursor(selectedIdx);
    else if (selectedIdx > clampedCursor + effectiveVisibleCount - 1) {
      setCursor(selectedIdx - effectiveVisibleCount + 1);
    }
  }, [selectedIdx, clampedCursor, effectiveVisibleCount]);

  const selected = days[selectedIdx] ?? today;
  const dayStart = useMemo(() => {
    const d = new Date(selected); d.setHours(0, 0, 0, 0); return d;
  }, [selected]);
  const dayEnd = useMemo(() => {
    const d = new Date(selected); d.setHours(23, 59, 59, 999); return d;
  }, [selected]);
  const dayKey = dateKey(dayStart);

  const isPast = dayStart.getTime() < today.getTime();
  const isFuture = dayStart.getTime() > today.getTime();
  const isToday = !isPast && !isFuture;

  const communeIds = useMemo(() => communes.map((c) => c.id), [communes]);

  // ===== Requêtes par jour =====
  const dayOutages = useQuery({
    queryKey: ["otl-outages", dayKey, communeIds.join(",")],
    queryFn: () => fetchOutagesWindow(dayStart.toISOString(), dayEnd.toISOString(), communeIds.length > 0 ? communeIds : undefined),
    enabled: !isFuture && communes.length > 0,
    staleTime: 60_000,
  });

  const dayHistory = useQuery({
    queryKey: ["otl-history", dayKey, communeIds.join(",")],
    queryFn: () => fetchHistoryRange(dayStart.toISOString(), dayEnd.toISOString(), communeIds.length > 0 ? communeIds : undefined),
    enabled: isPast && communes.length > 0,
    staleTime: 5 * 60_000,
  });

  const dayForecasts = useQuery({
    queryKey: ["otl-forecasts", dayKey, communeIds.join(",")],
    queryFn: () => fetchForecastsRange(
      dayKey,
      dayKey,
      communeIds.length > 0 ? communeIds : undefined,
    ),
    enabled: showForecasts && isFuture && communes.length > 0,
    staleTime: 5 * 60_000,
  });

  // Fusion outages affichables
  const timelineOutages = useMemo<Outage[]>(() => {
    if (isFuture) return [];
    if (isPast) {
      return (dayHistory.data ?? []).map((h) => ({
        id: h.id,
        commune_id: h.commune_id,
        sector: h.sector,
        starts_at: h.starts_at,
        ends_at: h.ends_at,
        estimated_duration_minutes: h.duration_minutes,
        status: "resolved" as const,
        source: h.source as Outage["source"],
        reliability_score: h.reliability_score,
        cause: h.cause,
        description: null,
        source_url: h.source_url,
        commune: h.commune,
      }));
    }
    return dayOutages.data ?? [];
  }, [isPast, isFuture, dayHistory.data, dayOutages.data]);

  const forecasts: Forecast[] = isFuture && showForecasts ? (dayForecasts.data ?? []) : [];

  const isLoading =
    (isPast && dayHistory.isLoading) ||
    (!isPast && !isFuture && dayOutages.isLoading) ||
    (isFuture && showForecasts && dayForecasts.isLoading);

  const noCommunes = communes.length === 0;
  const dayGapPx = 8;

  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
      <header className="px-5 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Coupures au fil du temps
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isVisitor
              ? "Aperçu d'aujourd'hui — créez un compte pour explorer le passé et les prévisions."
              : "Cliquez un jour pour voir les coupures et prévisions par commune."}
          </p>
        </div>
        {tier === "free" && !isVisitor && (
          <Link
            to="/abonnements"
            className="text-[11px] inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary hover:bg-primary/10"
          >
            <Lock className="h-3 w-3" /> Pro = passé 1 an + prévisions 14j
          </Link>
        )}
      </header>

      {/* === Ruban de jours === */}
      <div className="px-5 sm:px-6 pb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Jours précédents"
          onClick={() => setCursor((c) => Math.max(0, c - 1))}
          disabled={clampedCursor === 0}
          className="shrink-0 grid h-9 w-9 place-items-center rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 overflow-hidden">
          <div
            className="flex gap-2 transition-transform duration-200 ease-out"
            style={{
              transform: `translateX(calc(${-clampedCursor} * (((100% - ${(effectiveVisibleCount - 1) * dayGapPx}px) / ${effectiveVisibleCount}) + ${dayGapPx}px)))`,
            }}
          >
            {days.map((d, i) => {
              const isSel = i === selectedIdx;
              const isTodayCell = i === todayIndex;
              const accessible = isAccessible(i);
              const offset = i - todayIndex;
              const lockedReason = !accessible
                ? offset > 0
                  ? "Pro"
                  : offset < 0
                  ? "Pro"
                  : null
                : null;

              const cellInner = (
                <>
                  <span className="text-[10px] uppercase tracking-wider opacity-75">
                    {isTodayCell ? "Auj." : d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span className="text-sm font-semibold leading-tight">{d.getDate()}</span>
                  {lockedReason && (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium uppercase">
                      <Lock className="h-2.5 w-2.5" /> {lockedReason}
                    </span>
                  )}
                </>
              );

              const baseClass =
                "shrink-0 h-14 flex flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-xs transition-colors min-w-0";
              const styleStr: CSSProperties = {
                flex: `0 0 calc((100% - ${(effectiveVisibleCount - 1) * dayGapPx}px) / ${effectiveVisibleCount})`,
              };
              const stateClass = isSel
                ? "bg-primary text-primary-foreground border-primary shadow-soft"
                : !accessible
                ? "bg-muted/40 text-muted-foreground border-dashed border-border/60 cursor-pointer hover:bg-muted/60"
                : isTodayCell
                ? "border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10"
                : i > todayIndex
                ? "border-warning/30 text-foreground hover:bg-warning/10"
                : "border-border text-foreground hover:bg-muted";

              if (!accessible) {
                return (
                  <Link
                    key={d.toISOString()}
                    to="/abonnements"
                    className={`${baseClass} ${stateClass}`}
                    style={styleStr}
                    aria-label="Jour verrouillé — passez à Pro"
                  >
                    {cellInner}
                  </Link>
                );
              }

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => handleClickDay(i)}
                  className={`${baseClass} ${stateClass}`}
                  style={styleStr}
                  aria-pressed={isSel}
                >
                  {cellInner}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          aria-label="Jours suivants"
          onClick={() => setCursor((c) => Math.min(maxCursor, c + 1))}
          disabled={clampedCursor >= maxCursor}
          className="shrink-0 grid h-9 w-9 place-items-center rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* === Vue du jour sélectionné === */}
      <div className="px-5 sm:px-6 pb-5">
        {noCommunes ? (
          <EmptyCommunesBlock ctaLabel={emptyCommunesCtaLabel} ctaTo={emptyCommunesCtaTo} />
        ) : isLoading ? (
          <div className="rounded-xl border border-border bg-muted/20 h-48 animate-pulse" />
        ) : isFuture && !showForecasts ? (
          <ForecastsLockedBlock />
        ) : (
          <DayTimeline
            date={selected}
            outages={timelineOutages}
            forecasts={forecasts}
            showForecasts={isFuture && showForecasts}
            communes={communes}
            lockedAfterNow={isVisitor && isToday}
            lockedCtaText={isVisitor ? "Créer un compte gratuit" : "Essai gratuit Pro 7j · sans CB"}
            lockedCtaTo={isVisitor ? "/connexion" : "/abonnements"}
            teaserHours={1}
            emptyTitle="Aucune commune à afficher"
            emptyDescription="Ajoutez une commune favorite."
            emptyShowCta={false}
          />
        )}

        {isVisitor && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-4 flex flex-wrap items-center gap-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="flex-1 text-sm">
              <strong>Créez votre compte gratuit</strong> pour suivre votre commune,
              voir les <strong>7 derniers jours</strong> et activer les alertes.
            </p>
            <Link
              to="/connexion"
              className="inline-flex items-center rounded-md bg-gradient-ocean px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Créer un compte
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyCommunesBlock({ ctaLabel, ctaTo }: { ctaLabel: string; ctaTo: string }) {
  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-8 text-center">
      <MapPin className="h-6 w-6 mx-auto text-primary mb-2" />
      <p className="text-sm font-medium">Aucune commune à suivre pour le moment</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Ajoutez votre commune favorite pour voir sa frise chronologique.
      </p>
      <Link
        to={ctaTo}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-3.5 w-3.5" /> {ctaLabel}
      </Link>
    </div>
  );
}

function ForecastsLockedBlock() {
  return (
    <div className="rounded-xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5 p-8 text-center">
      <Lock className="h-6 w-6 mx-auto text-primary mb-2" />
      <p className="text-sm font-semibold">Prévisions réservées au plan Pro</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Anticipez vos coupures grâce à notre moteur statistique. Essai gratuit 7 jours.
      </p>
      <Link
        to="/abonnements"
        className="inline-flex items-center gap-1.5 rounded-md bg-gradient-ocean px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        Démarrer mon essai gratuit
      </Link>
    </div>
  );
}
