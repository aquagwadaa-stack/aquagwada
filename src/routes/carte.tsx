import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { fetchOngoingOutages, fetchOutagesWindow } from "@/lib/queries/outages";
import { fetchForecastsRange } from "@/lib/queries/forecasts";
import { DayTimeline } from "@/components/outages/Timeline";
import { StatusBadge } from "@/components/outages/StatusBadge";
import { Activity, Droplets, Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { canSeeForecasts, PLAN_CAPS } from "@/lib/subscription";
import { ReportBlock } from "@/components/reports/ReportBlock";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { ForecastTeaserLocked } from "@/components/upsell/ForecastTeaser";
import { useEffectiveTier } from "@/hooks/use-admin";

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

  // Bornes de date stabilisées (arrondies au jour) pour éviter les invalidations de cache.
  const dayKey = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const today = useMemo(() => new Date(dayKey), [dayKey]);
  const { startIso, endIso } = useMemo(() => {
    const s = new Date(dayKey); s.setHours(0, 0, 0, 0);
    const e = new Date(dayKey); e.setHours(23, 59, 59, 999);
    return { startIso: s.toISOString(), endIso: e.toISOString() };
  }, [dayKey]);

  const communes = useQuery({ queryKey: ["communes"], queryFn: fetchCommunes, staleTime: 5 * 60_000 });
  const ongoing = useQuery({
    queryKey: ["ongoing"],
    queryFn: fetchOngoingOutages,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  const today24 = useQuery({
    queryKey: ["outages-today", startIso, endIso],
    queryFn: () => fetchOutagesWindow(startIso, endIso),
    staleTime: 60_000,
  });

  const lockTimeline = !canSeeForecasts(tier);
  const showForecasts = canSeeForecasts(tier);
  const caps = PLAN_CAPS[tier];

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
  const today24Filtered = filterByFavs(today24.data);
  const noFavs = restrictToFavs && favIds.length === 0;

  // === Communes pour timelines multi-lignes ===
  const allCommunes = useMemo(
    () => (communes.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [communes.data]
  );
  // Visiteurs OU Business : toute la Guadeloupe. Free/Pro connecté : favoris.
  const timelineCommunes = !user || tier === "business" ? allCommunes : favCommunes;
  const timelineCommuneIds = timelineCommunes.map((c) => c.id);

  // === Prévisions sur N prochains jours ===
  const forecastDays = caps.forecastDays || 7; // pour l'aperçu visiteur
  const futureRange = useMemo(() => {
    const start = new Date(dayKey);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, forecastDays - 1));
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      days: Array.from({ length: forecastDays }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      }),
    };
  }, [dayKey, forecastDays]);

  const futureForecasts = useQuery({
    queryKey: ["forecasts-range", futureRange.from, futureRange.to, timelineCommuneIds.join(",")],
    queryFn: () => fetchForecastsRange(
      futureRange.from,
      futureRange.to,
      timelineCommuneIds.length > 0 ? timelineCommuneIds : undefined
    ),
    enabled: showForecasts && (communes.isSuccess || timelineCommuneIds.length > 0),
    staleTime: 5 * 60_000,
  });

  // === Historique J-7 (aperçu) pour la timeline « passé » ===
  const pastRange = useMemo(() => {
    const end = new Date(dayKey);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6); // 7 derniers jours hors aujourd'hui
    return {
      startIso: new Date(start.setHours(0, 0, 0, 0)).toISOString(),
      endIso: new Date(end.setHours(23, 59, 59, 999)).toISOString(),
      days: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      }),
    };
  }, [dayKey]);

  const pastOutages = useQuery({
    queryKey: ["outages-past7", pastRange.startIso, pastRange.endIso],
    queryFn: () => fetchOutagesWindow(pastRange.startIso, pastRange.endIso, timelineCommuneIds.length > 0 ? timelineCommuneIds : undefined),
    staleTime: 5 * 60_000,
    enabled: timelineCommuneIds.length > 0,
  });

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

        <div className="mt-8">
          <DayTimeline
            date={today}
            outages={today24Filtered}
            lockedAfterNow={lockTimeline}
            lockedCtaText="Essai gratuit Pro 7j · sans CB"
            lockedCtaTo="/abonnements"
            teaserHours={1}
            communes={restrictToFavs && !favs.isLoading && favCommunes.length > 0 ? favCommunes : undefined}
          />
        </div>

        {/* === Historique 7 derniers jours (timeline multi-communes) === */}
        <section className="mt-10 space-y-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-xl font-semibold">7 derniers jours</h2>
              <p className="text-sm text-muted-foreground">
                Coupures passées par commune {tier === "business" ? "· toutes les communes" : restrictToFavs ? "· vos favoris" : ""}
              </p>
            </div>
            {tier === "free" && (
              <span className="text-[11px] inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary">
                <Lock className="h-3 w-3" /> Plan Pro = 6 mois · Business = 5 ans
              </span>
            )}
          </div>
          {communes.isLoading || favs.isLoading ? (
            <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">Chargement des communes…</div>
          ) : timelineCommuneIds.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {noFavs ? (
                <>Choisissez votre commune favorite pour voir son historique.{" "}
                  <Link to="/ma-commune" className="text-primary underline">Choisir</Link>
                </>
              ) : "Aucune commune sélectionnée."}
            </div>
          ) : (
            <div className="grid gap-3">
              {pastRange.days.map((d) => (
                <DayTimeline
                  key={d.toISOString()}
                  date={d}
                  outages={(pastOutages.data ?? []).filter((o) => {
                    const t = new Date(o.starts_at);
                    return t.toDateString() === d.toDateString();
                  })}
                  communes={timelineCommunes}
                />
              ))}
            </div>
          )}
        </section>

        {/* === Prévisions 14 jours (timeline multi-communes) === */}
        <section className="mt-10 space-y-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-warning" /> Prévisions {showForecasts ? `${forecastDays} jours` : "à venir"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Estimations basées sur le planning SMGEAG et l'historique{tier === "business" ? " · toutes les communes" : restrictToFavs ? " · vos favoris" : ""}.
              </p>
            </div>
          </div>
          {!showForecasts ? (
            <ForecastTeaserLocked />
          ) : communes.isLoading || favs.isLoading ? (
            <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">Chargement des communes…</div>
          ) : timelineCommuneIds.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {noFavs ? (
                <>Choisissez votre commune favorite pour voir ses prévisions.{" "}
                  <Link to="/ma-commune" className="text-primary underline">Choisir</Link>
                </>
              ) : "Aucune commune."}
            </div>
          ) : (
            <div className="grid gap-3">
              {futureRange.days.slice(0, 7).map((d) => {
                const dayStr = d.toISOString().slice(0, 10);
                const dayForecasts = (futureForecasts.data ?? []).filter((f) => f.forecast_date === dayStr);
                return (
                  <DayTimeline
                    key={d.toISOString()}
                    date={d}
                    outages={[]}
                    forecasts={dayForecasts}
                    showForecasts
                    communes={timelineCommunes}
                  />
                );
              })}
              {forecastDays > 7 && (
                <p className="text-[11px] text-center text-muted-foreground">
                  Affichage 7/{forecastDays} jours · les jours suivants sont visibles dans <Link to="/ma-commune" className="underline">Ma commune</Link>.
                </p>
              )}
            </div>
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