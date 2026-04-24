import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Sparkles, Mail, Bell, Zap, Smartphone, Building2 } from "lucide-react";
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
      { name: "description", content: "Gratuit, Pro à 5,99€/mois, Business sur devis — choisissez le forfait adapté à vos besoins de suivi des coupures d'eau en Guadeloupe." },
    ],
  }),
});

/** Format euros FR : 5,99 € — 25 € (sans virgule si entier). */
function fmtPrice(n: number): string {
  return Number.isInteger(n) ? `${n} €` : `${n.toFixed(2).replace(".", ",")} €`;
}

function fmtHistory(days: number): string {
  if (days >= 365) {
    const years = Math.round(days / 365);
    return years === 1 ? "1 an" : `${years} ans`;
  }
  if (days >= 30) {
    const months = Math.round(days / 30);
    return `${months} mois`;
  }
  return `${days} jours`;
}

/** Lignes du comparatif détaillé : valeur + ton (positif/neutre/locked). */
type CellRender =
  | { kind: "text"; value: string; tone?: "ok" | "muted" }
  | { kind: "check"; sub?: string }
  | { kind: "locked"; sub?: string };

const FEATURE_MATRIX: Array<{
  key: string;
  label: string;
  desc?: string;
  pick: (p: PlanRow) => CellRender;
}> = [
  {
    key: "audience",
    label: "Recommandé pour",
    pick: (p) => ({ kind: "text", value: p.tier === "free" ? "Découverte" : p.tier === "pro" ? "Particulier / Famille" : "Pro / Collectivité", tone: "ok" }),
  },
  {
    key: "communes",
    label: "Communes suivies",
    pick: (p) => ({ kind: "text", value: p.max_communes >= 999 ? "Illimitées" : `Jusqu'à ${p.max_communes}`, tone: "ok" }),
  },
  {
    key: "history",
    label: "Historique disponible",
    pick: (p) => ({ kind: "text", value: fmtHistory(p.history_days), tone: "ok" }),
  },
  {
    key: "forecasts",
    label: "Prévisions à 14 jours",
    pick: (p) => p.forecast_days > 0 ? { kind: "check" } : { kind: "locked" },
  },
  {
    key: "preventive",
    label: "Notifications préventives (jusqu'à 48h avant)",
    pick: (p) => p.tier !== "free" ? { kind: "check" } : { kind: "locked" },
  },
  {
    key: "push",
    label: "Notifications push (PWA)",
    desc: "Temps réel, gratuites, illimitées",
    pick: () => ({ kind: "check", sub: "★ Illimitées, temps réel" }),
  },
  {
    key: "email",
    label: "Alertes par email",
    pick: () => ({ kind: "check", sub: "Illimitées" }),
  },
  {
    key: "sms",
    label: "Alertes SMS",
    desc: "Pour pros uniquement (clients non inscrits)",
    pick: (p) => p.sms_enabled
      ? { kind: "text", value: "Sur devis", tone: "muted" }
      : { kind: "locked", sub: "Pas nécessaire — push suffit" },
  },
  {
    key: "whatsapp",
    label: "Alertes WhatsApp",
    desc: "Pour pros uniquement (clients non inscrits)",
    pick: (p) => p.whatsapp_enabled
      ? { kind: "text", value: "Sur devis", tone: "muted" }
      : { kind: "locked", sub: "Pas nécessaire — push suffit" },
  },
  {
    key: "api",
    label: "Accès API B2B",
    pick: (p) => p.api_access ? { kind: "check" } : { kind: "locked" },
  },
];

function CellView({ c }: { c: CellRender }) {
  if (c.kind === "check") {
    return (
      <div className="flex flex-col items-center">
        <Check className="h-4 w-4 text-success" />
        {c.sub && <span className="mt-0.5 text-[10px] text-success font-medium">{c.sub}</span>}
      </div>
    );
  }
  if (c.kind === "locked") {
    return (
      <div className="flex flex-col items-center">
        <Lock className="h-3 w-3 text-muted-foreground/60" />
        {c.sub && <span className="mt-0.5 text-[10px] text-muted-foreground italic">{c.sub}</span>}
      </div>
    );
  }
  return (
    <span className={`text-xs ${c.tone === "ok" ? "text-foreground font-medium" : "text-muted-foreground"}`}>
      {c.value}
    </span>
  );
}

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
          <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold">Choisis ta formule</h1>
          <p className="mt-3 text-primary-foreground/85 max-w-2xl mx-auto">
            De l'usage citoyen au suivi pro multi-communes, en passant par l'API métier. Push gratuit pour tous.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        {/* CARTES PRIX */}
        <div className="grid gap-6 md:grid-cols-3">
          {(plans.data ?? []).map((p, i) => {
            const isPro = p.tier === "pro";
            const isBusiness = p.tier === "business";
            const highlight = isPro;
            return (
              <div
                key={p.id}
                className={`relative rounded-2xl border p-6 shadow-soft ${
                  highlight ? "border-primary/40 bg-card ring-2 ring-primary/30" : "border-border bg-card"
                }`}
              >
                {highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-ocean px-3 py-1 text-xs font-medium text-primary-foreground">
                    Le plus populaire
                  </span>
                )}
                <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                  {p.tier === "free" && <Smartphone className="h-4 w-4 text-muted-foreground" />}
                  {isPro && <Zap className="h-4 w-4 text-primary" />}
                  {isBusiness && <Building2 className="h-4 w-4 text-primary" />}
                  {p.name}
                </h3>

                <div className="mt-3">
                  {isBusiness && (
                    <p className="text-xs text-muted-foreground mb-0.5">à partir de</p>
                  )}
                  <p className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold">{fmtPrice(Number(p.price_eur_monthly))}</span>
                    <span className="text-sm text-muted-foreground">/ mois</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isBusiness
                      ? "Tarif final selon volume SMS / WhatsApp — sur devis"
                      : isPro
                        ? `ou ${Number(p.price_eur_yearly).toFixed(0)} €/an (2 mois offerts)`
                        : "Pas de carte requise"}
                  </p>
                </div>

                <ul className="mt-5 space-y-2 text-sm">
                  {(p.features as string[]).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isPro ? (
                  trialActive ? (
                    <Button disabled className="mt-6 w-full" variant="outline">
                      Essai en cours
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStartTrial}
                      disabled={busy}
                      className="mt-6 w-full bg-gradient-ocean text-primary-foreground"
                    >
                      {busy ? "…" : "Démarrer mon essai 7 jours"}
                    </Button>
                  )
                ) : isBusiness ? (
                  <Button asChild className="mt-6 w-full gap-2" variant="outline">
                    <a href="mailto:contact@aquagwada.fr?subject=Demande%20de%20devis%20Business%20AquaGwada&body=Bonjour%2C%0A%0AJe%20souhaite%20un%20devis%20Business%20pour%20%3A%0A-%20Nombre%20de%20communes%20%3A%0A-%20Volume%20SMS%2Fmois%20estim%C3%A9%20%3A%0A-%20WhatsApp%20%3A%20oui%2Fnon%0A-%20Acc%C3%A8s%20API%20%3A%20oui%2Fnon%0A%0AMerci%20%21">
                      <Mail className="h-4 w-4" /> Demander un devis
                    </a>
                  </Button>
                ) : (
                  <Button asChild className="mt-6 w-full" variant="outline">
                    <Link to="/connexion">Commencer gratuitement</Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* ENCART PÉDAGOGIQUE — pourquoi le push suffit */}
        <div className="mt-12 rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Bell className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary sm:hidden" />
                Pourquoi le plan Pro suffit largement à 99% des gens
              </h3>
              <p className="mt-2 text-sm text-foreground/85">
                Les <strong>notifications push</strong> (incluses Gratuit + Pro) sont aussi rapides qu'un SMS,
                <strong> gratuites</strong> et <strong>illimitées</strong>. Tant que ton téléphone est allumé et que tu as
                installé AquaGwada (5 secondes, depuis le navigateur — pas besoin de l'App Store), tu reçois l'alerte
                <strong> en temps réel</strong>, même app fermée, même écran verrouillé. Exactement comme une notif WhatsApp ou Instagram.
              </p>
              <p className="mt-3 text-sm text-foreground/85">
                → Le <strong>SMS</strong> et <strong>WhatsApp</strong> ne sont utiles que si tu gères une <strong>entreprise</strong>
                (hôtel, restaurant, syndic, mairie, école) qui doit prévenir un grand nombre de
                <strong> clients qui ne sont pas inscrits sur AquaGwada</strong>. Pour ça : Business sur devis.
              </p>
              <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-card border border-border p-3">
                  <Zap className="h-4 w-4 text-primary mb-1" />
                  <p className="font-semibold">Instantané</p>
                  <p className="text-muted-foreground mt-0.5">Notif reçue en &lt; 2 secondes après une coupure détectée.</p>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <Smartphone className="h-4 w-4 text-primary mb-1" />
                  <p className="font-semibold">Comme une vraie app</p>
                  <p className="text-muted-foreground mt-0.5">Icône sur l'écran d'accueil, ouverture en plein écran. Mais sans App Store.</p>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <Check className="h-4 w-4 text-success mb-1" />
                  <p className="font-semibold">Aucune limite</p>
                  <p className="text-muted-foreground mt-0.5">100 notifs par jour si besoin. Pas de coût. Pas de quota.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COMPARATIF DÉTAILLÉ */}
        {plans.data && plans.data.length > 0 && (
          <div className="mt-14">
            <h2 className="font-display text-2xl font-semibold mb-1">Comparatif détaillé</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Tout ce qui est inclus, plan par plan. Les SMS / WhatsApp ne sont qu'un supplément <em>pour pros</em>.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 w-1/3">Fonctionnalité</th>
                    {plans.data.map((p) => (
                      <th key={p.id} className="text-center px-4 py-3">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-foreground text-sm normal-case font-display font-semibold">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground normal-case">
                            {p.tier === "business" ? `dès ${fmtPrice(Number(p.price_eur_monthly))}/mois` : `${fmtPrice(Number(p.price_eur_monthly))}/mois`}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {FEATURE_MATRIX.map((row) => (
                    <tr key={row.key} className="hover:bg-muted/20">
                      <td className="px-4 py-3 align-top">
                        <p className="text-foreground font-medium">{row.label}</p>
                        {row.desc && <p className="text-[11px] text-muted-foreground italic mt-0.5">{row.desc}</p>}
                      </td>
                      {plans.data!.map((p) => (
                        <td key={p.id} className="px-4 py-3 text-center align-middle">
                          <CellView c={row.pick(p)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CONSEIL FINAL */}
        <div className="mt-8 rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
          <p className="text-sm text-foreground">
            💡 <strong>Conseil :</strong> commence par le <strong>plan Gratuit</strong> (1 commune).
            Si tu veux suivre toute la famille (jusqu'à 5 communes) ou recevoir une alerte
            <strong> 24h avant</strong> une coupure programmée → <strong>Pro à 5,99 €/mois</strong> (essai 7 jours sans CB).
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Paiement Stripe activé prochainement pour le plan Pro. Aucun prélèvement pour l'instant.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
