import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { fetchOngoingOutages, fetchOutagesWindow } from "@/lib/queries/outages";
import { DayTimeline } from "@/components/outages/Timeline";
import { StatusBadge } from "@/components/outages/StatusBadge";
import { Activity, Droplets, Lock } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { fetchEffectiveSubscription } from "@/lib/queries/subscription";
import { canSeeForecasts, type Tier } from "@/lib/subscription";
import { ReportBlock } from "@/components/reports/ReportBlock";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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

  // Bornes de date stabilisées (arrondies au jour) pour éviter les invalidations de cache.
  const today = useMemo(() => new Date(), []);
  const dayKey = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
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

  const sub = useQuery({
    queryKey: ["subscription", user?.id ?? "anon"],
    queryFn: () => fetchEffectiveSubscription(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });
  const tier: Tier = (sub.data?.tier as Tier) ?? "free";
  const lockTimeline = !canSeeForecasts(tier);

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
            communes={restrictToFavs ? favCommunes : undefined}
          />
        </div>
      </div>
    </AppShell>
  );
}