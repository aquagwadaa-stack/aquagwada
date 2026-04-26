import { Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Tier } from "@/lib/subscription";

/**
 * Affiche une ligne ou un toggle verrouillé. Cliquer redirige vers /abonnements.
 * Volontairement visible (pas masqué) : objectif = frustration contrôlée → conversion.
 */
export function LockedFeature({
  label,
  requires = "pro",
  variant = "row",
  className = "",
}: {
  label: string;
  requires?: Tier;
  variant?: "row" | "toggle" | "badge";
  className?: string;
}) {
  const tierLabel = requires === "business" ? "Business" : "Pro";

  if (variant === "badge") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground ${className}`}>
        <Lock className="h-3 w-3" /> {tierLabel}
      </span>
    );
  }

  if (variant === "toggle") {
    return (
      <Link
        to="/abonnements"
        className={`group flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm opacity-80 hover:opacity-100 hover:border-primary/40 transition ${className}`}
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-7 rounded-full bg-muted border border-border" aria-hidden />
          <span className="text-muted-foreground">{label}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
          <Lock className="h-3 w-3" /> {tierLabel}
        </span>
      </Link>
    );
  }

  return (
    <Link
      to="/abonnements"
      className={`group flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm hover:border-primary/40 transition ${className}`}
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="text-[11px] font-medium text-primary group-hover:underline">
        Disponible avec le plan {tierLabel}
      </span>
    </Link>
  );
}

/** Bloc upsell complet, à afficher en bas d'une page. */
export function UpsellCard({ tier }: { tier: Tier }) {
  if (tier !== "free") return null;
  return (
    <Link
      to="/abonnements"
      className="block rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-5 hover:border-primary/60 transition shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Plan Pro · 7 jours offerts</p>
          <h3 className="mt-1 font-display text-lg font-semibold">Passez à Pro pour :</h3>
          <ul className="mt-2 space-y-1 text-sm text-foreground/80">
            <li>• Suivre jusqu'à <strong>5 communes</strong></li>
            <li>• Recevoir des alertes <strong>push illimitées</strong></li>
            <li>• Accéder aux <strong>prévisions à 14 jours</strong></li>
            <li>• Notifications préventives avant coupure</li>
          </ul>
        </div>
        <span className="shrink-0 rounded-full bg-gradient-ocean px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Découvrir
        </span>
      </div>
    </Link>
  );
}
