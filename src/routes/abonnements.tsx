import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { fetchEffectiveSubscription, startProTrial } from "@/lib/queries/subscription";
import { toast } from "sonner";
import { useState } from "react";

type PlanRow = {
  id: string;
  tier: "free" | "pro" | "business";
  name: string;
  price_eur_monthly: number;
  price_eur_yearly: number;
  max_communes: number;
  history_days: number;
  forecast_days: number;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  api_access: boolean;
  features: string[];
};

export const Route = createFileRoute("/abonnements")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Abonnements · AquaGwada" },
      { name: "description", content: "Gratuit, Pro, Business — choisissez le forfait adapté à vos besoins de suivi des coupures d'eau." },
    ],
  }),
});

const FEATURE_MATRIX: Array<{ key: string; label: string; pick: (p: PlanRow) => string | boolean }> = [
  { key: "communes", label: "Communes suivies", pick: (p) => `Jusqu'à ${p.max_communes}` },
  { key: "history", label: "Historique disponible", pick: (p) => `${p.history_days} jours` },
  { key: "forecasts", label: "Prévisions à 14 jours", pick: (p) => p.forecast_days > 0 },
  { key: "preventive", label: "Notifications préventives", pick: (p) => p.tier !== "free" },
  { key: "email", label: "Alertes par email", pick: () => true },
  { key: "sms", label: "Alertes SMS", pick: (p) => p.sms_enabled },
  { key: "whatsapp", label: "Alertes WhatsApp", pick: (p) => p.whatsapp_enabled },
  { key: "api", label: "Accès API B2B", pick: (p) => p.api_access },
];

function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const sub = useQuery({
    queryKey: ["subscription", user?.id ?? "anon"],
    queryFn: () => fetchEffectiveSubscription(user!.id),
    enabled: !!user,
  });

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as PlanRow[];
    },
  });

  async function handleStartTrial() {
    if (!user) {
      navigate({ to: "/connexion" });
      return;
    }
    setBusy(true);
    try {
      const r = await startProTrial(user.id, 7);
      if (!r.ok) {
        toast.error(r.reason ?? "Impossible de démarrer l'essai");
      } else {
        toast.success("Essai Pro démarré ! 7 jours pour tout tester.");
        qc.invalidateQueries({ queryKey: ["subscription", user.id] });
        navigate({ to: "/ma-commune" });
      }
    } finally {
      setBusy(false);
    }
  }

  const trialActive = !!sub.data?.trialActive;

  return (
    <AppShell>
      <section className="bg-gradient-deep text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3" /> 7 jours d'essai Pro · sans carte
          </span>
          <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold">Choisissez votre formule</h1>
          <p className="mt-3 text-primary-foreground/85 max-w-2xl mx-auto">
            De l'usage citoyen au suivi pro multi-communes, en passant par l'API métier.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {(plans.data ?? []).map((p, i) => (
            <div key={p.id} className={`relative rounded-2xl border p-6 shadow-soft ${i === 1 ? "border-primary/40 bg-card ring-2 ring-primary/30" : "border-border bg-card"}`}>
              {i === 1 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-ocean px-3 py-1 text-xs font-medium text-primary-foreground">Le plus populaire</span>}
              <h3 className="font-display text-xl font-semibold">{p.name}</h3>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">{Number(p.price_eur_monthly).toFixed(0)}€</span>
                <span className="text-sm text-muted-foreground">/ mois</span>
              </p>
              <p className="text-xs text-muted-foreground">ou {Number(p.price_eur_yearly).toFixed(0)}€/an</p>
              <ul className="mt-5 space-y-2 text-sm">
                {(p.features as string[]).map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /><span>{f}</span></li>
                ))}
              </ul>
              <Button asChild className={`mt-6 w-full ${i === 1 ? "bg-gradient-ocean text-primary-foreground" : ""}`} variant={i === 1 ? "default" : "outline"}>
                <Link to="/connexion">{p.tier === "free" ? "Commencer" : p.tier === "business" ? "Nous contacter" : "Essayer 7 jours"}</Link>
              </Button>
            </div>
          ))}
        </div>

        {/* Comparatif détaillé : verrous explicites pour pousser la conversion */}
        {plans.data && plans.data.length > 0 && (
          <div className="mt-14">
            <h2 className="font-display text-2xl font-semibold mb-4">Comparatif détaillé</h2>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Fonctionnalité</th>
                    {plans.data.map((p) => (
                      <th key={p.id} className="text-center px-4 py-3">{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {FEATURE_MATRIX.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-3 text-foreground">{row.label}</td>
                      {plans.data!.map((p) => {
                        const v = row.pick(p);
                        return (
                          <td key={p.id} className="px-4 py-3 text-center">
                            {typeof v === "string"
                              ? <span className="text-foreground">{v}</span>
                              : v
                                ? <Check className="h-4 w-4 text-success inline" />
                                : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> verrouillé</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">Le paiement Stripe sera activé prochainement. Aucun prélèvement pour l'instant.</p>
      </section>
    </AppShell>
  );
}
