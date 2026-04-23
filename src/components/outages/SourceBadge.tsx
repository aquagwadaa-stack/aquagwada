import type { Outage } from "@/lib/queries/outages";
import { reliabilityLabel } from "@/lib/format";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

const SRC: Record<Outage["source"], string> = {
  official: "Officiel",
  scraping: "Site officiel",
  user_report: "Signalement",
  forecast: "Prévision",
};

export function SourceBadge({ source, score }: { source: Outage["source"]; score: number }) {
  const r = reliabilityLabel(score);
  const Icon = r.tone === "ok" ? ShieldCheck : r.tone === "warn" ? ShieldAlert : ShieldQuestion;
  const tone = r.tone === "ok" ? "text-success" : r.tone === "warn" ? "text-warning-foreground" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`} title={`${r.label} • Score ${(score * 100).toFixed(0)}%`}>
      <Icon className="h-3.5 w-3.5" /> {SRC[source]} · {(score * 100).toFixed(0)}%
    </span>
  );
}