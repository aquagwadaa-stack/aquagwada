import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { fetchOngoingOutages, fetchOutagesWindow } from "@/lib/queries/outages";
import { fetchForecastsRange } from "@/lib/queries/forecasts";
import { DayTimeline, DayPicker } from "@/components/outages/Timeline";
import { StatusBadge } from "@/components/outages/StatusBadge";
import { Activity, Droplets, Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { canSeeForecasts, PLAN_CAPS } from "@/lib/subscription";
import { ReportBlock } from "@/components/reports/ReportBlock";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { fetchHistoryRange } from "@/lib/queries/history";
import { ForecastTeaserLocked } from "@/components/upsell/ForecastTeaser";
import { useEffectiveTier } from "@/hooks/use-admin";
import { useState } from "react";

const OutageMap = lazy(() => import("@/components/map/OutageMap").then((m) => ({ default: m.OutageMap })));

export const Route = createFileRoute("/carte")({
  component: CartePage,
  head: () => ({
    meta: [
      { title: "Carte des coupures d'eau · AquaGwada" },
      { name: "description", content: "Carte interactive des coupures d'eau en Guadeloupe en temps réel." },
      { property: "og:title", content: "Carte temps réel · AquaGwada" },
      { property: "og:description", content: "Visualisez les coupures d'eau en Guadeloupe sur une carte interactive." },
    ],
  }),
});

function CartePage() {
  const { user } = useAuth();
  const { tier } = useEffectiveTier();

  // Toutes les pages partagent désormais la même mécanique : un seul DayPicker
  // qui couvre 7 jours passés + N jours futurs (selon plan), et UNE timeline
  // unique pour le jour sélectionné.
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const dayStart = useMemo(() => {
    const d = new Date(selectedDay); d.setHours(0, 0, 0, 0); return d;
  }, [selectedDay]);
  const dayEnd = useMemo(() => {
    const d = new Date(selectedDay); d.setHours(23, 59, 59, 999); return d;
  }, [selectedDay]);
  const dayKey = dayStart.toISOString();

  const communes = useQuery({ queryKey: ["communes"], queryFn: fetchCommunes, staleTime: 5 * 60_000 });
  const ongoing = useQuery({
    queryKey: ["ongoing"],
    queryFn: fetchOngoingOutages,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const lockTimeline = !canSeeForecasts(tier);
  const showForecasts = canSeeForecasts(tier);
  const caps = PLAN_CAPS[tier];
  // Fenêtre du sélecteur : 7 jours passés (toujours visible, source = history)
  // + N jours futurs (0 pour free, 14 pour pro/business).
  const backDays = 7;
  const forwardDays = caps.forecastDays;

  // Communes favorites (pour filtrer la sidebar et la timeline en plan free/pro)
  const favs = useQuery({
    queryKey: ["favs-min", user?.id ?? "anon"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_communes")
        .select("commune_id, communes(id,name)")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const favIds = useMemo(() => (favs.data ?? []).map((f) => f.commune_id), [favs.data]);
  const favCommunes = useMemo(
    () =>
      (favs.data ?? [])
        .map((f: any) => f.communes)
        .filter((c: any): c is { id: string; name: string } => !!c && !!c.id && !!c.name),
    [favs.data]
  );

  // Règle :
  //  - visiteurs : tout visible
  //  - free connecté : seulement leurs favoris
  //  - pro/trial : seulement leurs favoris (Business : tout)
  const restrictToFavs = !!user && tier !== "business";
  const filterByFavs = <T extends { commune_id: string }>(arr: T[] | undefined): T[] => {
    const list = arr ?? [];
    if (!restrictToFavs) return list;
    if (favIds.length === 0) return [];
    return list.filter((o) => favIds.includes(o.commune_id));
  };

  const ongoingFiltered = filterByFavs(ongoing.data);
  const noFavs = restrictToFavs && favIds.length === 0;

  // === Communes pour timelines multi-lignes ===
  const allCommunes = useMemo(
    () => (communes.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [communes.data]
  );
  // Pour les requêtes : Visiteurs/Business = toutes communes, sinon = favoris.
  // Mais l'AFFICHAGE de la timeline ne montre QUE les communes ayant des
  // données ce jour-là (sinon on retombe dans la "liste infinie" non utile).
  const queryCommunes = !user || tier === "business" ? allCommunes : favCommunes;
  const queryCommuneIds = queryCommunes.map((c) => c.id);

  // === Données pour le jour sélectionné ===
  const isPast = dayStart.getTime() < new Date().setHours(0, 0, 0, 0);
  const isFuture = dayStart.getTime() > new Date().setHours(0, 0, 0, 0);

  // Coupures live (aujourd'hui ou jour proche): on tape `outages` pour les
  // status non-résolus + jour du jour. Pour les jours passés on utilise
  // l'historique. Pour les jours futurs on n'affiche que les prévisions.
  const dayOutages = useQuery({
    queryKey: ["outages-day", dayKey, queryCommuneIds.join(",")],
    queryFn: () => fetchOutagesWindow(dayStart.toISOString(), dayEnd.toISOString(), queryCommuneIds.length > 0 ? queryCommuneIds : undefined),
    enabled: !isFuture && (communes.isSuccess || queryCommuneIds.length > 0),
    staleTime: 60_000,
  });

  const dayHistory = useQuery({
    queryKey: ["history-day", dayKey, queryCommuneIds.join(",")],
    queryFn: () => fetchHistoryRange(dayStart.toISOString(), dayEnd.toISOString(), queryCommuneIds.length > 0 ? queryCommuneIds : undefined),
    enabled: isPast && (communes.isSuccess || queryCommuneIds.length > 0),
    staleTime: 5 * 60_000,
  });

  const dayForecasts = useQuery({
    queryKey: ["forecasts-day", dayKey, queryCommuneIds.join(",")],
    queryFn: () => fetchForecastsRange(
      dayStart.toISOString().slice(0, 10),
      dayStart.toISOString().slice(0, 10),
      queryCommuneIds.length > 0 ? queryCommuneIds : undefined,
    ),
    enabled: showForecasts && isFuture && (communes.isSuccess || queryCommuneIds.length > 0),
    staleTime: 5 * 60_000,
  });

  // Fusion : pour passé → history, pour aujourd'hui/avenir proche → outages.
  const timelineOutages = useMemo(() => {
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
        source: h.source as "official" | "scraping" | "user_report" | "forecast",
        reliability_score: h.reliability_score,
        cause: h.cause,
        description: null,
        source_url: null,
        commune: h.commune,
      }));
    }
    return dayOutages.data ?? [];
  }, [isPast, isFuture, dayHistory.data, dayOutages.data]);

  // Timeline COMPACTE : on ne garde que les communes qui ont au moins
  // une coupure ou une prévision pour le jour sélectionné.
  const timelineCommunes = useMemo(() => {
    const active = new Set<string>();
    for (const o of timelineOutages) active.add(o.commune_id);
    if (showForecasts && isFuture) {
      for (const f of (dayForecasts.data ?? [])) active.add(f.commune_id);
    }
    if (active.size === 0) return [];
    return queryCommunes.filter((c) => active.has(c.id));
  }, [timelineOutages, dayForecasts.data, showForecasts, isFuture, queryCommunes]);

  // Pour l'historique panel : si Business → toutes communes, sinon favs
  const historyCommuneIds = tier === "business" || !user ? allCommunes.map((c) => c.id) : favIds;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Carte des coupures</h1>
            <p className="text-sm text-muted-foreground">Vue d'ensemble de la Guadeloupe — mise à jour en continu.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              <Activity className="h-4 w-4 text-primary" />
              <strong>{ongoing.data?.length ?? 0}</strong>
              <span className="text-muted-foreground">coupure{(ongoing.data?.length ?? 0) > 1 ? "s" : ""} en Guadeloupe</span>
            </div>
          </div>
        </header>

        {restrictToFavs && favIds.length > 0 && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="flex-1">
              Vous voyez uniquement vos {favIds.length} commune{favIds.length > 1 ? "s" : ""} favorite{favIds.length > 1 ? "s" : ""}.{" "}
              {tier === "free" && (
                <>
                  <Link to="/abonnements" className="text-primary font-medium underline">Passez à Pro</Link>{" "}pour suivre jusqu'à 5 communes.
                </>
              )}
              {tier === "pro" && (
                <>
                  <Link to="/abonnements" className="text-primary font-medium underline">Passez à Business</Link>{" "}pour suivre toute la Guadeloupe.
                </>
              )}
            </span>
          </div>
        )}
        {noFavs && (
          <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm flex flex-wrap items-center gap-3">
            <span className="flex-1">
              Choisissez votre commune favorite pour voir les coupures qui vous concernent.
            </span>
            <Link to="/ma-commune" className="text-xs font-semibold text-primary underline">
              Choisir ma commune
            </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft" style={{ height: 520 }}>
            <Suspense fallback={<div className="h-full grid place-items-center text-muted-foreground">Chargement de la carte…</div>}>
              {communes.data && <OutageMap communes={communes.data} outages={ongoing.data ?? []} />}
            </Suspense>
          </div>

          <aside className="space-y-4">
            <ReportBlock defaultCommuneId={favIds[0]} />
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Droplets className="h-4 w-4 text-primary" /> En cours</h3>
              {ongoing.isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              ) : ongoingFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {noFavs
                    ? "Ajoutez une commune favorite pour suivre les coupures qui vous concernent."
                    : "Aucune coupure active. L'eau coule partout 💧"}
                </p>
              ) : (
                <ul className="space-y-2 max-h-[440px] overflow-auto pr-1">
                  {ongoingFiltered.map((o) => (
                    <li key={o.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{o.commune?.name}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      {o.sector && <p className="text-xs text-muted-foreground mt-1">{o.sector}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        {/* === Timeline unique avec sélecteur de jour (passé + futur) === */}
        <section className="mt-10 space-y-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Timeline {isPast ? "(historique)" : isFuture ? "(prévisions)" : "(aujourd'hui)"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tier === "business"
                  ? "Toutes les communes de Guadeloupe."
                  : restrictToFavs
                  ? "Vos communes favorites."
                  : "Toutes les communes."}{" "}
                7 jours passés{showForecasts ? ` · ${forwardDays} jours de prévisions` : " · prévisions réservées au plan Pro"}.
              </p>
            </div>
            {tier === "free" && isFuture && (
              <span className="text-[11px] inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary">
                <Lock className="h-3 w-3" /> Prévisions Pro
              </span>
            )}
          </div>

          <DayPicker
            selected={selectedDay}
            onChange={setSelectedDay}
            forwardDays={forwardDays}
            backDays={backDays}
          />

          {communes.isLoading || (user && favs.isLoading) ? (
            <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : isFuture && !showForecasts ? (
            <ForecastTeaserLocked />
          ) : (
            <DayTimeline
              date={selectedDay}
              outages={timelineOutages}
              forecasts={isFuture ? (dayForecasts.data ?? []) : []}
              showForecasts={isFuture && showForecasts}
              lockedAfterNow={!isPast && lockTimeline}
              lockedCtaText="Essai gratuit Pro 7j · sans CB"
              lockedCtaTo="/abonnements"
              teaserHours={1}
              communes={timelineCommunes}
            />
          )}
        </section>

        {/* === Historique détaillé (panel) === */}
        <section className="mt-10">
          <HistoryPanel tier={tier} communeIds={historyCommuneIds} />
        </section>
      </div>
    </AppShell>
  );
}