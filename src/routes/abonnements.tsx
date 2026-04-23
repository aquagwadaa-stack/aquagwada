import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/abonnements")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Abonnements · AquaGwada" },
      { name: "description", content: "Gratuit, Pro, Business — choisissez le forfait adapté à vos besoins de suivi des coupures d'eau." },
    ],
  }),
});

function PricingPage() {
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <section className="bg-gradient-deep text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs"><Sparkles className="h-3 w-3" /> 7 jours d'essai Pro · sans carte</span>
          <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold">Choisissez votre formule</h1>
          <p className="mt-3 text-primary-foreground/85 max-w-2xl mx-auto">De l'usage citoyen au suivi pro multi-communes, en passant par l'API métier.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {(plans.data ?? []).map((p: any, i: number) => (
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
        <p className="mt-6 text-center text-xs text-muted-foreground">Le paiement Stripe sera activé prochainement. Aucun prélèvement pour l'instant.</p>
      </section>
    </AppShell>
  );
}