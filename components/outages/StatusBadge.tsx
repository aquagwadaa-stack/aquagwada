import type { Outage } from "@/lib/queries/outages";
import { Droplet, DropletOff, CalendarClock, CheckCircle2, XCircle } from "lucide-react";

const MAP: Record<Outage["status"], { label: string; cls: string; Icon: typeof Droplet }> = {
  ongoing:   { label: "Coupure en cours", cls: "bg-destructive/10 text-destructive border-destructive/30", Icon: DropletOff },
  scheduled: { label: "Programmée",        cls: "bg-warning/15 text-warning-foreground border-warning/40 [color:var(--warning-foreground)]", Icon: CalendarClock },
  resolved:  { label: "Eau revenue",       cls: "bg-success/10 text-success border-success/30 [color:var(--success)]", Icon: CheckCircle2 },
  cancelled: { label: "Annulée",           cls: "bg-muted text-muted-foreground border-border", Icon: XCircle },
};

export function StatusBadge({ status, size = "sm" }: { status: Outage["status"]; size?: "sm" | "md" }) {
  const { label, cls, Icon } = MAP[status];
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${pad} font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}