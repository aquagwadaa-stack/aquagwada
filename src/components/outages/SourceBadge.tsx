import type { Outage } from "@/lib/queries/outages";
import { reliabilityLabel } from "@/lib/format";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

const SRC: Record<Outage["source"], string> = {
  official: "Officiel",
  scraping: "Site officiel",
  user_report: "Signalement",
  forecast: "Risque estime",
};

export function SourceBadge({ source, score }: { source: Outage["source"]; score: number }) {
  const reliability = reliabilityLabel(score);
  const Icon = reliability.tone === "ok" ? ShieldCheck : reliability.tone === "warn" ? ShieldAlert : ShieldQuestion;
  const tone =
    reliability.tone === "ok"
      ? "text-success"
      : reliability.tone === "warn"
        ? "text-warning-foreground"
        : "text-muted-foreground";

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`} title={`${reliability.label} - Score ${(score * 100).toFixed(0)}%`}>
      <Icon className="h-3.5 w-3.5" /> {SRC[source]} - {(score * 100).toFixed(0)}%
    </span>
  );
}
