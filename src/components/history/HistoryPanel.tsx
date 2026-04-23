import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchHistory, type HistoryEntry } from "@/lib/queries/history";
import { PLAN_CAPS, type Tier } from "@/lib/subscription";
import { History, Lock, Calendar } from "lucide-react";
import { formatDuration } from "@/lib/format";

/**
 * Affiche l'historique des coupures résolues sur la fenêtre autorisée par le plan.
 * - free : 7 jours
 * - pro / essai : 365 jours
 * - business : ~5 ans
 * Filtré sur les communes favorites de l'utilisateur.
 */
export function HistoryPanel({ tier, communeIds }: { tier: Tier; communeIds: string[] }) {
  const caps = PLAN_CAPS[tier];
  const days = caps.historyDays;

  const q = useQuery({
    queryKey: ["history", tier, communeIds.join(","), days],
    queryFn: () => fetchHistory({ communeIds, daysBack: days, page: 1, pageSize: 20 }),
    enabled: communeIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const rows: HistoryEntry[] = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  const labelDuree =
    tier === "free" ? "7 derniers jours"
      : tier === "pro" ? "1 an d'historique"
        : "5 ans d'historique";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Historique des coupures</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3" /> {labelDuree}
        </span>
      </div>

      {communeIds.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4">
          Ajoutez une commune favorite pour consulter son historique.
        </p>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4">
          Aucune coupure archivée sur cette période. C'est plutôt bon signe 💧
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((h) => {
            const start = new Date(h.starts_at);
            const end = new Date(h.ends_at);
            return (
              <li key={h.id} className="py-2.5 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">
                  {start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} → {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {formatDuration(h.duration_minutes)}
                </span>
                {h.commune?.name && (
                  <span className="ml-auto text-xs font-medium text-foreground/80">{h.commune.name}</span>
                )}
                {h.cause && <span className="text-xs text-muted-foreground italic">· {h.cause}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {total > rows.length && (
        <p className="text-[11px] text-muted-foreground text-center">
          {rows.length} affichées sur {total} archivées.
        </p>
      )}

      {tier === "free" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-xs flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1">
            Plan gratuit : 7 jours d'historique.{" "}
            <Link to="/abonnements" className="text-primary font-medium underline">Pro = 1 an</Link>,{" "}
            Business = 5 ans.
          </span>
        </div>
      )}
      {tier === "pro" && (
        <p className="text-[11px] text-muted-foreground text-center">
          Pro : 1 an d'historique · <Link to="/abonnements" className="text-primary underline">Business = 5 ans</Link>
        </p>
      )}
    </section>
  );
}