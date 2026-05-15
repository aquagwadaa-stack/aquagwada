import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, DatabaseZap, Droplets, Eye, History, Loader2, RefreshCw, ShieldCheck, Sparkles, Users, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useIsAdmin, useSimulatedTier, setSimulatedTier } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import type { Tier } from "@/lib/subscription";
import { useAuth } from "@/providers/AuthProvider";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin - AquaGwada" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

type JobStepResult = {
  label: string;
  ok: boolean;
  status: number;
  body: unknown;
  error?: string;
};

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/connexion" });
  }, [authLoading, user, navigate]);

  if (authLoading || adminLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl p-10 text-muted-foreground">Chargement...</div>
      </AppShell>
    );
  }
  if (!user) return null;
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Acces reserve</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette section est reservee aux administrateurs.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Retour a l'accueil</Link>
          </Button>
        </div>
      </AppShell>
    );
  }
  return <AdminContent />;
}

function AdminContent() {
  const sim = useSimulatedTier();

  const usersStats = useQuery({
    queryKey: ["admin", "users-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const [total, profiles7d] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
      ]);
      return { total: total.count ?? 0, last7d: profiles7d.count ?? 0 };
    },
  });

  const subsStats = useQuery({
    queryKey: ["admin", "subs-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("tier, status");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const key = `${row.tier}:${row.status}`;
        counts[key] = (counts[key] ?? 0) + 1;
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
        supabase
          .from("outages")
          .select("*", { count: "exact", head: true })
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
      const { count } = await supabase
        .from("forecasts")
        .select("*", { count: "exact", head: true })
        .gte("forecast_date", today);
      return { upcoming: count ?? 0 };
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

  const refetchDashboard = () => {
    void Promise.all([
      usersStats.refetch(),
      subsStats.refetch(),
      outagesStats.refetch(),
      historyStats.refetch(),
      forecastStats.refetch(),
      reportsStats.refetch(),
      scraperRuns.refetch(),
    ]);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin AquaGwada
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold">Tableau de bord</h1>
            <p className="text-sm text-muted-foreground">Suivi interne des donnees et des imports.</p>
          </div>
          <Link to="/" className="text-xs text-muted-foreground underline">
            Retour site public
          </Link>
        </header>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-semibold">Simulation utilisateur</h2>
            </div>
            {sim && (
              <span className="text-xs rounded-full bg-warning/15 border border-warning/40 px-2 py-0.5 text-warning-foreground">
                Simulation active : <strong>{sim}</strong>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["free", "pro", "business"] as Tier[]).map((tier) => (
              <Button
                key={tier}
                size="sm"
                variant={sim === tier ? "default" : "outline"}
                onClick={() => {
                  setSimulatedTier(tier);
                  toast.success(`Vue simulee : ${tier}`);
                }}
              >
                {tier}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSimulatedTier(null);
                toast("Simulation desactivee");
              }}
            >
              Reinitialiser
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            title="Utilisateurs inscrits"
            value={usersStats.data?.total ?? "-"}
            sub={`+${usersStats.data?.last7d ?? 0} sur 7 j`}
          />
          <KpiCard
            icon={<Sparkles className="h-4 w-4" />}
            title="Abonnes actifs"
            value={(subsStats.data?.["pro:active"] ?? 0) + (subsStats.data?.["business:active"] ?? 0)}
            sub={`Trial Pro : ${subsStats.data?.["pro:trialing"] ?? 0}`}
          />
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            title="Coupures en cours"
            value={outagesStats.data?.ongoing ?? "-"}
            sub={`${outagesStats.data?.last7d ?? 0} creees sur 7 j`}
          />
          <KpiCard
            icon={<History className="h-4 w-4" />}
            title="Historique archive"
            value={historyStats.data?.total ?? "-"}
            sub="coupures dans la base"
          />
          <KpiCard
            icon={<Sparkles className="h-4 w-4" />}
            title="Previsions a venir"
            value={forecastStats.data?.upcoming ?? "-"}
            sub="lignes futures dans forecasts"
          />
          <KpiCard
            icon={<Droplets className="h-4 w-4" />}
            title="Signalements citoyens"
            value={reportsStats.data?.total ?? "-"}
            sub="total recus"
          />
        </section>

        <RepairDataPanel onDone={refetchDashboard} />

        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display text-lg font-semibold mb-3">Repartition des souscriptions</h2>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {Object.entries(subsStats.data ?? {}).sort().map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">{key}</span>
                <strong>{value}</strong>
              </div>
            ))}
            {Object.keys(subsStats.data ?? {}).length === 0 && (
              <p className="text-muted-foreground text-xs">Aucune donnee.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-lg font-semibold">Runs de scraping</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Les jobs ne se declenchent plus depuis le navigateur.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => scraperRuns.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Rafraichir
            </Button>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Source</th>
                  <th className="py-2 pr-2">OK</th>
                  <th className="py-2 pr-2">Trouves</th>
                  <th className="py-2 pr-2">Inseres</th>
                  <th className="py-2 pr-2">MAJ</th>
                  <th className="py-2 pr-2">Notes</th>
                  <th className="py-2 pr-2">Demarre</th>
                </tr>
              </thead>
              <tbody>
                {(scraperRuns.data ?? []).map((run, index) => (
                  <tr key={index} className="border-b border-border/40">
                    <td className="py-2 pr-2 font-medium">{run.source}</td>
                    <td className="py-2 pr-2">{run.ok ? "OK" : "KO"}</td>
                    <td className="py-2 pr-2">{run.items_found}</td>
                    <td className="py-2 pr-2">{run.items_inserted}</td>
                    <td className="py-2 pr-2">{run.items_updated}</td>
                    <td className="py-2 pr-2 max-w-[260px] truncate text-muted-foreground" title={run.notes ?? ""}>
                      {run.notes}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {new Date(run.started_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
                {(scraperRuns.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-muted-foreground">
                      Aucun run recent.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function RepairDataPanel({ onDone }: { onDone: () => void }) {
  const { session } = useAuth();
  const [running, setRunning] = useState<"current" | "backfill" | null>(null);
  const [results, setResults] = useState<JobStepResult[]>([]);

  async function postJob(label: string, path: string, body: unknown = {}): Promise<JobStepResult> {
    const token = session?.access_token;
    if (!token) return { label, ok: false, status: 0, body: null, error: "Session admin absente" };

    const res = await fetch(path, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    const bodyOk = typeof parsed === "object" && parsed !== null && "ok" in parsed ? (parsed as { ok?: unknown }).ok !== false : true;
    return { label, ok: res.ok && bodyOk, status: res.status, body: parsed };
  }

  async function runSequence(mode: "current" | "backfill") {
    setRunning(mode);
    setResults([]);
    const steps = mode === "current"
      ? [
          { label: "Nettoyage", path: "/api/public/jobs/cleanup-history" },
          { label: "Planning actuel", path: "/api/public/jobs/scrape-planning" },
          { label: "Previsions", path: "/api/public/jobs/generate-forecasts" },
          { label: "Nettoyage final", path: "/api/public/jobs/cleanup-history" },
        ]
      : [
          { label: "Nettoyage", path: "/api/public/jobs/cleanup-history" },
          { label: "Backfill SMGEAG", path: "/api/public/jobs/backfill-planning", body: { since: "2026-04-01", maxPosts: 8 } },
          { label: "Previsions", path: "/api/public/jobs/generate-forecasts" },
          { label: "Nettoyage final", path: "/api/public/jobs/cleanup-history" },
        ];

    const nextResults: JobStepResult[] = [];
    try {
      for (const step of steps) {
        const result = await postJob(step.label, step.path, "body" in step ? step.body : {});
        nextResults.push(result);
        setResults([...nextResults]);
        if (!result.ok) break;
      }
      const allOk = nextResults.length === steps.length && nextResults.every((r) => r.ok);
      if (allOk) toast.success("Reparation terminee");
      else toast.error("Reparation interrompue");
    } finally {
      setRunning(null);
      onDone();
    }
  }

  const busy = running !== null;

  return (
    <section className="rounded-2xl border border-primary/20 bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Reparation donnees</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Lance les jobs serveur avec ton compte admin pour remplir historique et previsions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => runSequence("current")}>
            {running === "current" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Planning actuel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => runSequence("backfill")}>
            {running === "backfill" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5 mr-1" />}
            Backfill depuis avril
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((result) => (
            <div key={result.label} className="rounded-lg border border-border px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{result.label}</span>
                <span className={result.ok ? "text-success" : "text-destructive"}>
                  {result.ok ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> : <XCircle className="inline h-3.5 w-3.5 mr-1" />}
                  {result.status}
                </span>
              </div>
              <pre className="mt-2 max-h-36 overflow-auto rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function KpiCard({ icon, title, value, sub }: { icon: ReactNode; title: string | number; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-2 text-3xl font-display font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
