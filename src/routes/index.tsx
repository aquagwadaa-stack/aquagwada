import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { fetchOngoingOutages } from "@/lib/queries/outages";
import { fetchCommunes } from "@/lib/queries/communes";
import { Droplets, MapPin, Bell, ShieldCheck, Activity, Clock, Sparkles, Megaphone } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/providers/AuthProvider";
import { fetchEffectiveSubscription } from "@/lib/queries/subscription";
import { type Tier } from "@/lib/subscription";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OutageTimeline } from "@/components/outages/OutageTimeline";

export const Route = createFileRoute("/")({
  component: Index,
});

// Échantillon stable de communes "au pif" pour les visiteurs.
// On choisit 3 communes connues pour ne pas dépendre de l'ordre alphabétique.
const VISITOR_SAMPLE_NAMES = ["Pointe-à-Pitre", "Basse-Terre", "Le Moule", "Sainte-Anne", "Saint-François"];

function Index() {
  const { user } = useAuth();

  const ongoing = useQuery({
    queryKey: ["ongoing"],
    queryFn: fetchOngoingOutages,
    staleTime: 60_000,
  });

  const communesQ = useQuery({
    queryKey: ["communes"],
    queryFn: fetchCommunes,
    staleTime: 5 * 60_000,
  });

  const sub = useQuery({
    queryKey: ["subscription", user?.id ?? "anon"],
    queryFn: () => fetchEffectiveSubscription(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });
  const tier: Tier = (sub.data?.tier as Tier) ?? "free";

  // Communes favorites des utilisateurs connectés
  const favs = useQuery({
    queryKey: ["favs-min", user?.id ?? "anon"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_communes")
        .select("commune_id, communes(id,name)")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const favCommunes = useMemo(
    () =>
      (favs.data ?? [])
        .map((f: any) => f.communes)
        .filter((c: any): c is { id: string; name: string } => !!c && !!c.id && !!c.name),
    [favs.data]
  );

  const allCommunes = useMemo(
    () => (communesQ.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [communesQ.data]
  );

  // Sélection des communes affichées selon mode
  const { mode, displayCommunes } = useMemo(() => {
    if (!user) {
      // Visiteur : 3 communes "au pif" stables (même ordre à chaque rendu)
      const sample = VISITOR_SAMPLE_NAMES
        .map((n) => allCommunes.find((c) => c.name === n))
        .filter((c): c is { id: string; name: string } => !!c)
        .slice(0, 3);
      return { mode: "visitor" as const, displayCommunes: sample };
    }
    if (tier === "business") {
      return { mode: "all" as const, displayCommunes: allCommunes };
    }
    return { mode: "favorites" as const, displayCommunes: favCommunes };
  }, [user, tier, allCommunes, favCommunes]);

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
              Suivi des coupures d'eau en Guadeloupe en temps réel : carte interactive, frise chronologique, prévisions à 14 jours et alertes par notification et email.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to={user ? "/ma-commune" : "/connexion"}>
                  {user ? "Voir ma commune" : "Créer un compte gratuit"}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                <Link to={user ? "/carte" : "/connexion"}>
                  {user ? "Ouvrir la carte" : "Se connecter"}
                </Link>
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

      {/* === FRISE CHRONOLOGIQUE UNIQUE (remplace Aujourd'hui + Demain et après) === */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        {communesQ.isLoading || (!!user && favs.isLoading) ? (
          <div className="rounded-2xl border border-border bg-card h-72 animate-pulse" />
        ) : (
          <OutageTimeline
            tier={tier}
            mode={mode}
            communes={displayCommunes}
            visibleCount={3}
            emptyCommunesCtaLabel={user ? "Ajouter ma commune" : "Créer un compte"}
            emptyCommunesCtaTo={user ? "/ma-commune" : "/connexion"}
          />
        )}
      </section>

      {/* FEATURES */}
      <section className="bg-secondary/40 border-y border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Feature icon={MapPin} title="Carte temps réel" desc="Visualisez d'un coup d'œil les communes touchées et la sévérité de chaque coupure." />
          <Feature icon={Bell} title="Alertes intelligentes" desc="Notification push et email — au début de la coupure, à son retour, ou en préventif." />
          <Feature icon={ShieldCheck} title="Sources vérifiées" desc="Données officielles agrégées avec un score de fiabilité, complétées par les signalements citoyens." />
          <div className="rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/10 to-primary/5 p-6 shadow-soft flex flex-col">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Megaphone className="h-5 w-5" /></span>
            <h3 className="mt-4 font-display text-lg font-semibold">Signaler en 10 secondes</h3>
            <p className="mt-1 text-sm text-muted-foreground flex-1">Eau coupée, retour de l'eau, travaux : aidez vos voisins. Chaque signalement améliore la fiabilité.</p>
            <Button asChild size="sm" className="mt-4 self-start bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to={user ? "/carte" : "/connexion"}>Signaler maintenant</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="rounded-3xl bg-gradient-ocean p-10 md:p-14 text-primary-foreground text-center shadow-glow">
          <Droplets className="h-10 w-10 mx-auto opacity-80" />
          <h2 className="font-display text-3xl md:text-4xl font-bold mt-4">Ne soyez plus pris au dépourvu</h2>
          <p className="mt-3 text-primary-foreground/85 max-w-xl mx-auto">
            Créez votre compte gratuit et recevez les alertes pour votre commune. <strong>7 jours d'essai Pro offerts</strong>, sans carte bancaire, sans engagement.
          </p>
          <Button asChild size="lg" className="mt-6 bg-background text-foreground hover:bg-background/90">
            <Link to={user ? "/abonnements" : "/connexion"}>
              {user ? "Démarrer l'essai gratuit" : "Créer un compte"}
            </Link>
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
