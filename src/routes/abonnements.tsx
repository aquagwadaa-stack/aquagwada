import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Sparkles, Mail, Bell, Zap, Smartphone, Building2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { fetchEffectiveSubscription, startProTrial } from "@/lib/queries/subscription";
import { StripeEmbeddedCheckoutForm } from "@/components/payments/StripeEmbeddedCheckout";
import { getStripeEnvironment } from "@/lib/stripe";
import { createPortalSession } from "@/server/payments/checkout";

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
      { name: "description", content: "Gratuit, Pro a 5,99 EUR/mois, Business sur devis." },
    ],
  }),
});

function fmtPrice(n: number) {
  return Number.isInteger(n) ? `${n} EUR` : `${n.toFixed(2).replace(".", ",")} EUR`;
}

function fmtHistory(days: number) {
  if (days >= 365) return Math.round(days / 365) === 1 ? "1 an" : `${Math.round(days / 365)} ans`;
  if (days >= 30) return `${Math.round(days / 30)} mois`;
  return `${days} jours`;
}

function checkoutReturnUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://aquagwada.fr";
  return `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
}

function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [trialBusy, setTrialBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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

  const trialActive = !!sub.data?.trialActive;
  const status = sub.data?.status;
  const paidPlanActive = !!sub.data && ["pro", "business"].includes(sub.data.tier) && !trialActive && ["active", "trialing", "past_due"].includes(status ?? "");

  async function startTrial() {
    if (!user) {
      navigate({ to: "/connexion" });
      return;
    }
    setTrialBusy(true);
    try {
      const result = await startProTrial(user.id, 7);
      if (!result.ok) toast.error(result.reason ?? "Impossible de demarrer l'essai");
      else {
        toast.success("Essai Pro demarre : 7 jours pour tout tester.");
        qc.invalidateQueries({ queryKey: ["subscription", user.id] });
        navigate({ to: "/ma-commune" });
      }
    } finally {
      setTrialBusy(false);
    }
  }

  function openCheckout() {
    if (!user) {
      navigate({ to: "/connexion" });
      return;
    }
    setCheckoutOpen(true);
  }

  async function openPortal() {
    if (!user) {
      navigate({ to: "/connexion" });
      return;
    }
    setPortalBusy(true);
    try {
      const origin = window.location.origin;
      const result = await createPortalSession({
        data: { environment: getStripeEnvironment(), returnUrl: `${origin}/abonnements` },
      });
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ouvrir le portail Stripe");
      setPortalBusy(false);
    }
  }

  return (
    <AppShell>
      <section className="bg-gradient-deep text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3" /> 7 jours d'essai Pro, sans carte
          </span>
          <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold">Choisis ta formule</h1>
          <p className="mt-3 text-primary-foreground/85 max-w-2xl mx-auto">
            Suivi temps reel, alertes, historique et previsions pour anticiper les coupures d'eau en Guadeloupe.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {(plans.data ?? []).map((plan) => {
            const isPro = plan.tier === "pro";
            const isBusiness = plan.tier === "business";
            return (
              <article
                key={plan.id}
                className={`relative rounded-2xl border p-6 shadow-soft bg-card ${isPro ? "border-primary/40 ring-2 ring-primary/25" : "border-border"}`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-ocean px-3 py-1 text-xs font-medium text-primary-foreground">
                    Le plus utile
                  </span>
                )}

                <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                  {plan.tier === "free" && <Smartphone className="h-4 w-4 text-muted-foreground" />}
                  {isPro && <Zap className="h-4 w-4 text-primary" />}
                  {isBusiness && <Building2 className="h-4 w-4 text-primary" />}
                  {plan.name}
                </h2>

                <p className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold">{fmtPrice(Number(plan.price_eur_monthly))}</span>
                  <span className="text-sm text-muted-foreground">/ mois</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isBusiness ? "Sur devis selon volume" : isPro ? "Paiement securise par Stripe, annulable" : "Pour commencer simplement"}
                </p>

                <ul className="mt-5 space-y-2 text-sm">
                  {(plan.features ?? []).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-muted-foreground">
                    <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    <span>Historique : {fmtHistory(plan.history_days)}</span>
                  </li>
                </ul>

                {isPro ? (
                  paidPlanActive ? (
                    <Button onClick={openPortal} disabled={portalBusy} className="mt-6 w-full gap-2" variant="outline">
                      <CreditCard className="h-4 w-4" /> {portalBusy ? "Ouverture..." : "Gerer factures / annulation"}
                    </Button>
                  ) : (
                    <div className="mt-6 space-y-2">
                      <Button onClick={openCheckout} className="w-full bg-gradient-ocean text-primary-foreground">
                        S'abonner - 5,99 EUR/mois
                      </Button>
                      {!trialActive && (
                        <Button onClick={startTrial} disabled={trialBusy} variant="outline" className="w-full">
                          {trialBusy ? "Activation..." : "Ou essayer 7 jours gratuit"}
                        </Button>
                      )}
                      {trialActive && <p className="text-center text-[11px] text-muted-foreground">Essai Pro en cours.</p>}
                    </div>
                  )
                ) : isBusiness ? (
                  <Button asChild className="mt-6 w-full gap-2" variant="outline">
                    <a href="mailto:aqua.gwadaa@gmail.com?subject=Demande%20de%20devis%20Business%20AquaGwada">
                      <Mail className="h-4 w-4" /> Demander un devis
                    </a>
                  </Button>
                ) : (
                  <Button asChild className="mt-6 w-full" variant="outline">
                    <Link to="/connexion">Commencer gratuitement</Link>
                  </Button>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-primary/25 bg-primary/5 p-6">
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Notifications et facturation
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">Push instantane</p>
              <p className="mt-1 text-muted-foreground">Alertes temps reel via l'app installee sur le telephone.</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">Email branche</p>
              <p className="mt-1 text-muted-foreground">Alertes email, fin d'essai et facturation sont envoyees via Resend.</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">Stripe</p>
              <p className="mt-1 text-muted-foreground">Paiement, factures, moyen de paiement et annulation passent par le portail Stripe.</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 mt-0.5" /> Les SMS et WhatsApp restent reserves au Business sur devis, car ils coutent cher a grande echelle.
          </p>
        </div>
      </section>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paiement AquaGwada Pro</DialogTitle>
          </DialogHeader>
          {checkoutOpen && (
            <StripeEmbeddedCheckoutForm priceId="pro_monthly" returnUrl={checkoutReturnUrl()} />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
