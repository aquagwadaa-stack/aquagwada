import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/providers/AuthProvider";
import { useIsAdmin, useSimulatedTier, setSimulatedTier } from "@/hooks/use-admin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Users, Droplets, History, Sparkles, ShieldCheck, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tier } from "@/lib/subscription";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin · AquaGwada" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/connexion" });
  }, [authLoading, user, navigate]);

  if (authLoading || adminLoading) {
    return <AppShell><div className="mx-auto max-w-3xl p-10 text-muted-foreground">Chargement…</div></AppShell>;
  }
  if (!user) return null;
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Accès réservé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette section est réservée aux administrateurs.
          </p>
          <Button asChild className="mt-6"><Link to="/">Retour à l'accueil</Link></Button>
        </div>
      </AppShell>
    );
  }
  return <AdminContent />;
}

function AdminContent() {
  const sim = useSimulatedTier();

  // === KPIs ===
  const usersStats = useQuery({
    queryKey: ["admin", "users-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const [total, profiles7d] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
      ]);
      return {
        total: total.count ?? 0,
        last7d: profiles7d.count ?? 0,
      };
    },
  });

  const subsStats = useQuery({
    queryKey: ["admin", "subs-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier, status");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const k = `${row.tier}:${row.status}`;
        counts[k] = (counts[k] ?? 0) + 1;
      }
      return counts;
    },
  });

  const outagesStats = useQuery({
    queryKey: ["admin", "outages-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const [ongoing, total7d] = await Promise.all([
        supabase.from("outages").select("*", { count: "exact", head: true }).eq("status", "ongoing"),
        supabase.from("outages").select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
      ]);
      return { ongoing: ongoing.count ?? 0, last7d: total7d.count ?? 0 };
    },
  });

  const historyStats = useQuery({
    queryKey: ["admin", "history-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase.from("outage_history").select("*", { count: "exact", head: true });
      return { total: count ?? 0 };
    },
  });

  const forecastStats = useQuery({
    queryKey: ["admin", "forecasts-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [totalUpcoming] = await Promise.all([
        supabase.from("forecasts").select("*", { count: "exact", head: true }).gte("forecast_date", today),
      ]);
      return { upcoming: totalUpcoming.count ?? 0 };
    },
  });

  const reportsStats = useQuery({
    queryKey: ["admin", "reports-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase.from("reports").select("*", { count: "exact", head: true });
      return { total: count ?? 0 };
    },
  });

  const scraperRuns = useQuery({
    queryKey: ["admin", "scraper-runs"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scraper_runs")
        .select("source, ok, items_found, items_inserted, items_updated, notes, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  // === Trigger jobs ===
  const [running, setRunning] = useState<string | null>(null);
  async function trigger(slug: string, label: string) {
    setRunning(slug);
    try {
      const res = await fetch(`/api/public/jobs/${slug}`, { method: "POST" });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
      toast.success(`${label} terminé`, { description: text.slice(0, 200) });
      scraperRuns.refetch();
      historyStats.refetch();
      forecastStats.refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`${label} a échoué`, { description: msg });
    } finally {
      setRunning(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin AquaGwada
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold">Tableau de bord</h1>
            <p className="text-sm text-muted-foreground">Vue d'ensemble, scraping et simulation de tier.</p>
          </div>
          <Link to="/" className="text-xs text-muted-foreground underline">← Retour site public</Link>
        </header>

        {/* Simulation tier */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-semibold">Simuler une expérience utilisateur</h2>
            </div>
            {sim && (
              <span className="text-xs rounded-full bg-warning/15 border border-warning/40 px-2 py-0.5 text-warning-foreground">
                Simulation active : <strong>{sim}</strong>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Bascule l'UI sans toucher à votre vraie souscription. Par défaut admin = expérience Business complète.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["free", "pro", "business"] as Tier[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={sim === t ? "default" : "outline"}
                onClick={() => { setSimulatedTier(t); toast.success(`Vue simulée : ${t}`); }}
              >
                {t}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => { setSimulatedTier(null); toast("Simulation désactivée — vue admin par défaut (business)"); }}>
              Réinitialiser
            </Button>
          </div>
        </section>

        {/* KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            title="Utilisateurs inscrits"
            value={usersStats.data?.total ?? "—"}
            sub={`+${usersStats.data?.last7d ?? 0} sur 7 j`}
          />
          <KpiCard
            icon={<Sparkles className="h-4 w-4" />}
            title="Abonnés actifs (Pro/Business)"
            value={
              ((subsStats.data?.["pro:active"] ?? 0) +
               (subsStats.data?.["business:active"] ?? 0))
            }
            sub={`Trial Pro : ${subsStats.data?.["pro:trialing"] ?? 0}`}
          />
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            title="Coupures en cours"
            value={outagesStats.data?.ongoing ?? "—"}
            sub={`${outagesStats.data?.last7d ?? 0} créées sur 7 j`}
          />
          <KpiCard
            icon={<History className="h-4 w-4" />}
            title="Historique archivé"
            value={historyStats.data?.total ?? "—"}
            sub="coupures dans la base"
          />
          <KpiCard
            icon={<Sparkles className="h-4 w-4" />}
            title="Prévisions à venir"
            value={forecastStats.data?.upcoming ?? "—"}
            sub="lignes futures dans forecasts"
          />
          <KpiCard
            icon={<Droplets className="h-4 w-4" />}
            title="Signalements citoyens"
            value={reportsStats.data?.total ?? "—"}
            sub="total reçus"
          />
        </section>

        {/* Détail subs */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display text-lg font-semibold mb-3">Répartition des souscriptions</h2>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {Object.entries(subsStats.data ?? {}).sort().map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
            {Object.keys(subsStats.data ?? {}).length === 0 && (
              <p className="text-muted-foreground text-xs">Aucune donnée.</p>
            )}
          </div>
        </section>

        {/* Jobs */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="font-display text-lg font-semibold">Jobs de scraping</h2>
            <Button size="sm" variant="ghost" onClick={() => scraperRuns.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Rafraîchir
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 mb-4">
            <JobButton slug="scrape-smgeag" label="SMGEAG (live)" running={running} onRun={trigger} />
            <JobButton slug="scrape-planning" label="Planning hebdo" running={running} onRun={trigger} />
            <JobButton slug="backfill-planning" label="Backfill plannings SMGEAG" running={running} onRun={trigger} />
            <JobButton slug="scrape-ai-history" label="Historique IA (long)" running={running} onRun={trigger} />
            <JobButton slug="generate-forecasts" label="Générer prévisions stat." running={running} onRun={trigger} />
            <JobButton slug="cleanup-history" label="Nettoyage historique" running={running} onRun={trigger} />
            <JobButton slug="check-preventive" label="Préventif" running={running} onRun={trigger} />
          </div>

          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Source</th>
                  <th className="py-2 pr-2">OK</th>
                  <th className="py-2 pr-2">Trouvés</th>
                  <th className="py-2 pr-2">Insérés</th>
                  <th className="py-2 pr-2">MAJ</th>
                  <th className="py-2 pr-2">Notes</th>
                  <th className="py-2 pr-2">Démarré</th>
                </tr>
              </thead>
              <tbody>
                {(scraperRuns.data ?? []).map((r, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-2 pr-2 font-medium">{r.source}</td>
                    <td className="py-2 pr-2">{r.ok ? "✅" : "❌"}</td>
                    <td className="py-2 pr-2">{r.items_found}</td>
                    <td className="py-2 pr-2">{r.items_inserted}</td>
                    <td className="py-2 pr-2">{r.items_updated}</td>
                    <td className="py-2 pr-2 max-w-[260px] truncate text-muted-foreground" title={r.notes ?? ""}>{r.notes}</td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {new Date(r.started_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
                {(scraperRuns.data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Aucun run récent.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function KpiCard({ icon, title, value, sub }: { icon: React.ReactNode; title: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}<span>{title}</span>
      </div>
      <div className="mt-2 text-3xl font-display font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function JobButton({ slug, label, running, onRun }: {
  slug: string;
  label: string;
  running: string | null;
  onRun: (slug: string, label: string) => void;
}) {
  const isRunning = running === slug;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!!running}
      onClick={() => onRun(slug, label)}
      className="justify-start"
    >
      {isRunning ? <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
      {label}
    </Button>
  );
}