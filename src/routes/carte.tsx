import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { fetchOngoingOutages, fetchOutagesWindow } from "@/lib/queries/outages";
import { DayTimeline } from "@/components/outages/Timeline";
import { StatusBadge } from "@/components/outages/StatusBadge";
import { Activity, Droplets } from "lucide-react";

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
  const today = new Date();
  const start = new Date(today); start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(23, 59, 59, 999);

  const communes = useQuery({ queryKey: ["communes"], queryFn: fetchCommunes });
  const ongoing = useQuery({ queryKey: ["ongoing"], queryFn: fetchOngoingOutages, refetchInterval: 60_000 });
  const today24 = useQuery({
    queryKey: ["outages-today", start.toISOString(), end.toISOString()],
    queryFn: () => fetchOutagesWindow(start.toISOString(), end.toISOString()),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Carte des coupures</h1>
            <p className="text-sm text-muted-foreground">Vue d'ensemble de la Guadeloupe — mise à jour en continu.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
            <Activity className="h-4 w-4 text-primary" />
            <strong>{ongoing.data?.length ?? 0}</strong>
            <span className="text-muted-foreground">coupure{(ongoing.data?.length ?? 0) > 1 ? "s" : ""} en cours</span>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft" style={{ height: 520 }}>
            <Suspense fallback={<div className="h-full grid place-items-center text-muted-foreground">Chargement de la carte…</div>}>
              {communes.data && <OutageMap communes={communes.data} outages={ongoing.data ?? []} />}
            </Suspense>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Droplets className="h-4 w-4 text-primary" /> En cours</h3>
            {ongoing.isLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : (ongoing.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune coupure active. L'eau coule partout 💧</p>
            ) : (
              <ul className="space-y-2 max-h-[440px] overflow-auto pr-1">
                {(ongoing.data ?? []).map((o) => (
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
          </aside>
        </div>

        <div className="mt-8">
          <DayTimeline date={today} outages={today24.data ?? []} />
        </div>
      </div>
    </AppShell>
  );
}