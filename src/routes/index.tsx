import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { fetchOngoingOutages, fetchOutagesWindow } from "@/lib/queries/outages";
import { DayTimeline } from "@/components/outages/Timeline";
import { Droplets, MapPin, Bell, ShieldCheck, Activity, Clock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { ForecastTeaserLocked } from "@/components/upsell/ForecastTeaser";
import { useAuth } from "@/providers/AuthProvider";
import { fetchEffectiveSubscription } from "@/lib/queries/subscription";
import { canSeeForecasts, type Tier } from "@/lib/subscription";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user } = useAuth();
  const today = new Date();
  const start = new Date(today); start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(23, 59, 59, 999);
  const ongoing = useQuery({ queryKey: ["ongoing"], queryFn: fetchOngoingOutages });
  const todayOutages = useQuery({
    queryKey: ["outages-today", start.toISOString(), end.toISOString()],
    queryFn: () => fetchOutagesWindow(start.toISOString(), end.toISOString()),
  });
  const sub = useQuery({
    queryKey: ["subscription", user?.id ?? "anon"],
    queryFn: () => fetchEffectiveSubscription(user!.id),
    enabled: !!user,
  });
  const tier: Tier = (sub.data?.tier as Tier) ?? "free";
  // Visiteurs et plan gratuit : on bloque la timeline après "maintenant".
  const lockTimeline = !canSeeForecasts(tier);

  return (
    <AppShell>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-deep text-primary-foreground">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_20%,oklch(0.78_0.13_195/.5),transparent_60%),radial-gradient(circle_at_70%_70%,oklch(0.62_0.16_220/.4),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-28">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Données temps réel · Guadeloupe
            </span>
            <h1 className="mt-5 font-display text-4xl md:text-6xl font-bold leading-tight text-balance">
              Sachez quand l'eau revient. <span className="text-accent">Avant tout le monde.</span>
            </h1>
            <p className="mt-5 text-lg text-primary-foreground/80 max-w-2xl">
              Suivi des coupures d'eau en Guadeloupe en temps réel : carte, timeline horaire, prévisions à 14 jours et alertes par SMS, WhatsApp et email.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/ma-commune">Voir ma commune</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                <Link to="/carte">Ouvrir la carte</Link>
              </Button>
            </div>
          </motion.div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3 max-w-3xl">
            <Stat icon={Activity} label="Coupures actives" value={ongoing.data?.length ?? "—"} />
            <Stat icon={MapPin} label="Communes couvertes" value="32" />
            <Stat icon={Clock} label="Mise à jour" value="≤ 15 min" />
          </div>
        </div>
      </section>

      {/* TIMELINE TODAY */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold">Aujourd'hui en Guadeloupe</h2>
            <p className="text-sm text-muted-foreground mt-1">Toutes les coupures sur 24h, par tranche horaire.</p>
          </div>
          <Link to="/carte" className="text-sm text-primary hover:underline">Voir la carte →</Link>
        </div>
        {todayOutages.isLoading ? (
          <div className="rounded-2xl border border-border bg-card h-48 animate-pulse" />
        ) : (
          <DayTimeline
            date={today}
            outages={todayOutages.data ?? []}
            lockedAfterNow={lockTimeline}
            lockedCtaText="Essai gratuit Pro 7j · sans CB"
            lockedCtaTo="/abonnements"
            teaserPercentOfRest={0.2}
          />
        )}
        {lockTimeline && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            La fin de journée est masquée pour les visiteurs.{" "}
            <Link to="/abonnements" className="text-primary font-medium underline">
              Essai gratuit 7 jours
            </Link>{" "}
            pour tout voir, sans engagement.
          </p>
        )}
      </section>

      {/* PRÉVISIONS — verrouillé pour visiteurs / free, CTA essai gratuit */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold">Demain et après ?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Prévisions à 14 jours basées sur l'historique. Inclus dans l'essai gratuit Pro.
            </p>
          </div>
        </div>
        <ForecastTeaserLocked />
      </section>

      {/* FEATURES */}
      <section className="bg-secondary/40 border-y border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid md:grid-cols-3 gap-6">
          <Feature icon={MapPin} title="Carte temps réel" desc="Visualisez d'un coup d'œil les communes touchées et la sévérité de chaque coupure." />
          <Feature icon={Bell} title="Alertes intelligentes" desc="Email, SMS et WhatsApp — au début de la coupure, à son retour, ou en préventif." />
          <Feature icon={ShieldCheck} title="Sources vérifiées" desc="Données officielles agrégées avec un score de fiabilité, complétées par les signalements citoyens." />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="rounded-3xl bg-gradient-ocean p-10 md:p-14 text-primary-foreground text-center shadow-glow">
          <Droplets className="h-10 w-10 mx-auto opacity-80" />
          <h2 className="font-display text-3xl md:text-4xl font-bold mt-4">Ne soyez plus pris au dépourvu</h2>
          <p className="mt-3 text-primary-foreground/85 max-w-xl mx-auto">Créez votre compte gratuit et recevez les alertes pour votre commune. <strong>7 jours d'essai Pro offerts</strong>, sans carte bancaire, sans engagement.</p>
          <Button asChild size="lg" className="mt-6 bg-background text-foreground hover:bg-background/90">
            <Link to="/abonnements">Démarrer l'essai gratuit</Link>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Droplets; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary-foreground/70"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof Droplets; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-ocean text-primary-foreground"><Icon className="h-5 w-5" /></span>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
