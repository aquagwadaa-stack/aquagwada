import { Link } from "@tanstack/react-router";
import { Sparkles, Lock, ArrowRight, Clock } from "lucide-react";

/**
 * Teaser des prévisions verrouillées pour visiteurs/free.
 * Affiche une fausse-vraie timeline future avec blur + cadenas.
 * CTA principal : essai 7 jours sans engagement.
 */
export function ForecastTeaserLocked() {
  // Faux créneaux représentatifs (visuels uniquement, pas de vraies données)
  const days = ["Demain", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim.", "Lun."];
  const fakeBars = [
    { left: 33, width: 12, intensity: "high" },
    { left: 50, width: 8, intensity: "med" },
    { left: 70, width: 10, intensity: "high" },
    { left: 18, width: 6, intensity: "med" },
    { left: 60, width: 14, intensity: "high" },
  ];

  return (
    <div className="relative rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-soft overflow-hidden">
      {/* Contenu flouté en arrière-plan */}
      <div aria-hidden className="pointer-events-none select-none blur-[3px] opacity-70">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-warning" />
            Prévisions des 7 prochains jours
          </h3>
          <span className="text-xs text-muted-foreground">14 jours disponibles</span>
        </div>
        <div className="space-y-2">
          {days.map((d, i) => (
            <div key={d} className="relative h-8 rounded-md bg-muted/40">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {d}
              </span>
              {fakeBars.slice(0, (i % 3) + 1).map((b, j) => (
                <div
                  key={j}
                  className={
                    "absolute top-1 bottom-1 rounded border-2 border-dashed " +
                    (b.intensity === "high"
                      ? "bg-warning/30 border-warning/60"
                      : "bg-warning/10 border-warning/40")
                  }
                  style={{ left: `${b.left + i * 2}%`, width: `${b.width}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Voile + CTA centré */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background/40 via-background/85 to-background/95 p-4">
        <div className="text-center max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Lock className="h-3 w-3" /> Réservé aux membres Pro
          </span>
          <h3 className="mt-3 font-display text-xl sm:text-2xl font-bold">
            Anticipez les coupures à 14 jours
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Notre moteur statistique apprend des coupures passées pour prédire les prochaines.
            Plage horaire estimée, probabilité, tendance.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/connexion"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-ocean px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90 transition"
            >
              <Sparkles className="h-4 w-4" />
              Essai gratuit 7 jours
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/abonnements"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/40 transition"
            >
              Voir les forfaits
            </Link>
          </div>
          <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> Sans carte bancaire · sans engagement · annulable en 1 clic
          </p>
        </div>
      </div>
    </div>
  );
}