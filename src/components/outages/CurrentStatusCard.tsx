import type { Outage } from "@/lib/queries/outages";
import { Droplet, DropletOff, Clock, CheckCircle2 } from "lucide-react";
import { formatHM, formatDuration, durationBetween } from "@/lib/format";
import { SourceBadge } from "./SourceBadge";
import { Link } from "@tanstack/react-router";
import { ReportDialog } from "@/components/reports/ReportDialog";

export function CurrentStatusCard({
  communeName,
  outage,
  communeId,
}: {
  communeName: string;
  outage: Outage | null;
  communeId?: string;
}) {
  if (!outage) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success/15 [color:var(--success)]">
            <Droplet className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{communeName}</p>
            <h3 className="font-display text-2xl font-semibold mt-1">L'eau coule normalement</h3>
            <p className="text-sm text-muted-foreground mt-1">Aucune coupure signalée actuellement.</p>
            {communeId && (
              <div className="mt-3">
                <ReportDialog communeId={communeId} communeName={communeName} triggerLabel="Signaler un problème" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const ongoing = outage.status === "ongoing";
  const minutes = durationBetween(outage.starts_at, outage.ends_at) ?? outage.estimated_duration_minutes;

  return (
    <div className={`rounded-2xl border p-6 shadow-soft ${ongoing ? "border-destructive/30 bg-destructive/5" : "border-warning/40 bg-warning/10"}`}>
      <div className="flex items-start gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-full ${ongoing ? "bg-destructive/15 text-destructive animate-pulse-ring" : "bg-warning/20 [color:var(--warning-foreground)]"}`}>
          {ongoing ? <DropletOff className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{communeName}{outage.sector ? ` · ${outage.sector}` : ""}</p>
          <h3 className="font-display text-2xl font-semibold mt-1">
            {ongoing ? "Coupure en cours" : "Coupure programmée"}
          </h3>
          <div className="mt-2 grid sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Début" value={formatHM(outage.starts_at)} />
            <Stat label={ongoing ? "Retour estimé" : "Fin prévue"} value={outage.ends_at ? formatHM(outage.ends_at) : "Inconnu"} accent={!outage.ends_at} />
            <Stat label="Durée" value={formatDuration(minutes)} />
          </div>
          {outage.cause && <p className="mt-3 text-sm text-muted-foreground">{outage.cause}</p>}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <SourceBadge source={outage.source} score={outage.reliability_score} />
            {communeId && (
              <ReportDialog
                communeId={communeId}
                communeName={communeName}
                triggerLabel={ongoing ? "Signaler" : "Signaler"}
              />
            )}
            <Link to="/carte" className="ml-auto text-xs font-medium text-primary hover:underline">Voir sur la carte →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-lg ${accent ? "text-warning-foreground italic" : ""}`}>{value}</p>
    </div>
  );
}