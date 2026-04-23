import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { fetchOngoingOutages, fetchOutagesWindow } from "@/lib/queries/outages";
import { DayTimeline } from "@/components/outages/Timeline";
import { Droplets, MapPin, Bell, ShieldCheck, Activity, Clock, Sparkles, Megaphone, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { ForecastTeaserLocked } from "@/components/upsell/ForecastTeaser";
import { useAuth } from "@/providers/AuthProvider";
import { fetchEffectiveSubscription } from "@/lib/queries/subscription";
import { canSeeForecasts, type Tier } from "@/lib/subscription";
import { fetchForecastsRange } from "@/lib/queries/forecasts";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReportBlock } from "@/components/reports/ReportBlock";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user } = useAuth();

  // Bornes de date stabilisées (arrondies au jour) pour ne pas casser le cache.
  const today = useMemo(() => new Date(), []);
  const { startIso, endIso } = useMemo(() => {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 999);
    return { startIso: s.toISOString(), endIso: e.toISOString() };
  }, []);

  const ongoing = useQuery({
    queryKey: ["ongoing"],
    queryFn: fetchOngoingOutages,
    staleTime: 60_000,
  });
  const todayOutages = useQuery({
    queryKey: ["outages-today", startIso, endIso],
    queryFn: () => fetchOutagesWindow(startIso, endIso),
    staleTime: 60_000,
  });
  const sub = useQuery({
    queryKey: ["subscription", user?.id ?? "anon"],
    queryFn: () => fetchEffectiveSubscription(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });
  const tier: Tier = (sub.data?.tier as Tier) ?? "free";
  // Visiteurs et plan gratuit : on bloque la timeline après "maintenant".
  const lockTimeline = !canSeeForecasts(tier);

  // Communes favorites (filtrage liste & timeline pour utilisateurs connectés non-business)
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
  const favIds = useMemo(() => (favs.data ?? []).map((f) => f.commune_id), [favs.data]);
  const favCommunes = useMemo(
    () =>
      (favs.data ?? [])
        .map((f: any) => f.communes)
        .filter((c: any): c is { id: string; name: string } => !!c && !!c.id && !!c.name),
    [favs.data]
  );
  const restrictToFavs = !!user && tier !== "business";
  const todayFiltered = useMemo(() => {
    const list = todayOutages.data ?? [];
    if (!restrictToFavs) return list;
    if (favIds.length === 0) return [];
    return list.filter((o) => favIds.includes(o.commune_id));
  }, [todayOutages.data, restrictToFavs, favIds]);
  const noFavs = restrictToFavs && favIds.length === 0;

  // Prévisions à 14j visibles uniquement pour Pro/Business (essai inclus)
  const showForecasts = canSeeForecasts(tier);
  const { fromDate, toDate } = useMemo(() => {
    const t = new Date();
    return {
      fromDate: new Date(t.getTime() + 86400_000).toISOString().slice(0, 10),
      toDate: new Date(t.getTime() + 14 * 86400_000).toISOString().slice(0, 10),
    };
  }, []);
  const forecasts = useQuery({
    queryKey: ["forecasts-home", fromDate, toDate, restrictToFavs ? favIds.join(",") : "all"],
    queryFn: () => fetchForecastsRange(fromDate, toDate, restrictToFavs ? favIds : undefined),
    enabled: showForecasts,
    staleTime: 5 * 60_000,
  });

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
        {restrictToFavs && favIds.length > 0 && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="flex-1">
              Affichage limité à vos {favIds.length} commune{favIds.length > 1 ? "s" : ""} favorite{favIds.length > 1 ? "s" : ""}.{" "}
              {tier === "free" ? (
                <><Link to="/abonnements" className="text-primary font-medium underline">Passez à Pro</Link>{" "}pour suivre jusqu'à 5 communes.</>
              ) : tier === "pro" ? (
                <><Link to="/abonnements" className="text-primary font-medium underline">Passez à Business</Link>{" "}pour toute la Guadeloupe.</>
              ) : null}
            </span>
          </div>
        )}
        {noFavs && (
          <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm flex flex-wrap items-center gap-3">
            <span className="flex-1">Choisissez votre commune favorite pour voir les coupures qui vous concernent.</span>
            <Link to="/ma-commune" className="text-xs font-semibold text-primary underline">Choisir ma commune</Link>
          </div>
        )}
        {todayOutages.isLoading ? (
          <div className="rounded-2xl border border-border bg-card h-48 animate-pulse" />
        ) : (
          <DayTimeline
            date={today}
            outages={todayFiltered}
            lockedAfterNow={lockTimeline}
            lockedCtaText="Essai gratuit Pro 7j · sans CB"
            lockedCtaTo="/abonnements"
            teaserHours={1}
            communes={restrictToFavs && !favs.isLoading && favCommunes.length > 0 ? favCommunes : undefined}
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
        {showForecasts ? (
          <ForecastsUnlockedPreview forecasts={forecasts.data ?? []} loading={forecasts.isLoading} />
        ) : (
          <ForecastTeaserLocked />
        )}
      </section>

      {/* FEATURES */}
      <section className="bg-secondary/40 border-y border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Feature icon={MapPin} title="Carte temps réel" desc="Visualisez d'un coup d'œil les communes touchées et la sévérité de chaque coupure." />
          <Feature icon={Bell} title="Alertes intelligentes" desc="Email, SMS et WhatsApp — au début de la coupure, à son retour, ou en préventif." />
          <Feature icon={ShieldCheck} title="Sources vérifiées" desc="Données officielles agrégées avec un score de fiabilité, complétées par les signalements citoyens." />
          <div className="rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/10 to-primary/5 p-6 shadow-soft flex flex-col">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Megaphone className="h-5 w-5" /></span>
            <h3 className="mt-4 font-display text-lg font-semibold">Signaler en 10 secondes</h3>
            <p className="mt-1 text-sm text-muted-foreground flex-1">Eau coupée, retour de l'eau, travaux : aidez vos voisins. Chaque signalement améliore la fiabilité.</p>
            <Button asChild size="sm" className="mt-4 self-start bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/carte">Signaler maintenant</Link>
            </Button>
          </div>
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

function ForecastsUnlockedPreview({
  forecasts,
  loading,
}: {
  forecasts: Array<{ id: string; forecast_date: string; window_start: string | null; window_end: string | null; probability: number; commune?: { name: string } | null }>;
  loading: boolean;
}) {
  if (loading) {
    return <div className="rounded-2xl border border-border bg-card h-48 animate-pulse" />;
  }
  if (!forecasts.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <Sparkles className="h-6 w-6 mx-auto text-primary mb-2" />
        <p className="text-sm text-muted-foreground">
          Aucune prévision pour les 14 prochains jours. C'est plutôt bon signe 💧
        </p>
      </div>
    );
  }
  // Grouper par date
  const byDate = new Map<string, typeof forecasts>();
  for (const f of forecasts) {
    const arr = byDate.get(f.forecast_date) ?? [];
    arr.push(f);
    byDate.set(f.forecast_date, arr);
  }
  const dates = Array.from(byDate.keys()).slice(0, 7);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-warning" />
          Prévisions des prochains jours
        </h3>
        <span className="text-xs text-muted-foreground">{forecasts.length} prévision{forecasts.length > 1 ? "s" : ""}</span>
      </div>
      <ul className="space-y-2">
        {dates.map((d) => {
          const items = byDate.get(d) ?? [];
          const date = new Date(d);
          return (
            <li key={d} className="rounded-lg border border-border bg-card/50 p-3">
              <p className="text-sm font-medium capitalize">
                {date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {items.slice(0, 4).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <span>
                      {f.window_start?.slice(0, 5)}–{f.window_end?.slice(0, 5)}
                      {f.commune?.name && <span className="ml-2 text-foreground">{f.commune.name}</span>}
                    </span>
                    <span className="text-warning font-medium">{Math.round(f.probability * 100)}%</span>
                  </li>
                ))}
                {items.length > 4 && <li className="italic">+ {items.length - 4} autres…</li>}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
