import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { fetchOngoingOutages, fetchOutagesWindow } from "@/lib/queries/outages";
import { fetchForecastsRange } from "@/lib/queries/forecasts";
import { CurrentStatusCard } from "@/components/outages/CurrentStatusCard";
import { DayTimeline, DayPicker } from "@/components/outages/Timeline";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Heart, Plus, Trash2, Lock, Bell, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { canSeeForecasts, PLAN_CAPS, type Tier } from "@/lib/subscription";
import { LockedFeature, UpsellCard } from "@/components/upsell/LockedFeature";
import { fetchEffectiveSubscription, startProTrial } from "@/lib/queries/subscription";

export const Route = createFileRoute("/ma-commune")({
  component: MaCommunePage,
  head: () => ({
    meta: [
      { title: "Ma commune · AquaGwada" },
      { name: "description", content: "Suivi personnalisé des coupures d'eau pour vos communes favorites." },
    ],
  }),
});

function MaCommunePage() {
  const { user, loading } = useAuth();

  if (loading) return <AppShell><div className="mx-auto max-w-3xl p-10 text-muted-foreground">Chargement…</div></AppShell>;
  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <Heart className="h-10 w-10 mx-auto text-primary" />
          <h1 className="mt-4 font-display text-3xl font-semibold">Suivez vos communes</h1>
          <p className="mt-2 text-muted-foreground">Connectez-vous pour ajouter vos communes favorites et recevoir des alertes personnalisées.</p>
          <Button asChild className="mt-6 bg-gradient-ocean text-primary-foreground"><Link to="/connexion">Se connecter</Link></Button>
        </div>
      </AppShell>
    );
  }
  return <Authed />;
}

function Authed() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const communes = useQuery({ queryKey: ["communes"], queryFn: fetchCommunes });

  const subscription = useQuery({
    queryKey: ["subscription", user!.id],
    queryFn: () => fetchEffectiveSubscription(user!.id),
  });
  const tier: Tier = (subscription.data?.tier as Tier) ?? "free";
  const trialActive = !!subscription.data?.trialActive;
  const trialExpired = !!subscription.data?.trialExpired;
  const trialEndsAt = subscription.data?.trialEndsAt ?? null;
  const caps = PLAN_CAPS[tier];
  const showForecasts = canSeeForecasts(tier);
  const forecastDays = caps.forecastDays;
  const tierLabel = tier === "free"
    ? "Plan gratuit"
    : tier === "pro"
      ? trialActive ? "Essai Pro" : "Plan Pro"
      : "Plan Business";

  async function handleStartTrial() {
    const r = await startProTrial(user!.id, 7);
    if (!r.ok) return toast.error(r.reason ?? "Impossible de démarrer l'essai");
    toast.success("Essai Pro démarré ! 7 jours pour tout tester.");
    qc.invalidateQueries({ queryKey: ["subscription", user!.id] });
  }

  const favs = useQuery({
    queryKey: ["favs", user!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_communes")
        .select("id, commune_id, position, communes(id,name,slug,latitude,longitude)")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const favIds = useMemo(() => (favs.data ?? []).map((f) => f.commune_id), [favs.data]);
  const reachedLimit = favIds.length >= caps.maxCommunes;

  const ongoing = useQuery({
    queryKey: ["ongoing-favs", favIds],
    queryFn: fetchOngoingOutages,
    enabled: favIds.length > 0,
  });

  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const dayStart = useMemo(() => {
    const d = new Date(selectedDay); d.setHours(0, 0, 0, 0); return d;
  }, [selectedDay]);
  const dayEnd = useMemo(() => {
    const d = new Date(selectedDay); d.setHours(23, 59, 59, 999); return d;
  }, [selectedDay]);

  const dayOutages = useQuery({
    queryKey: ["outages-day-favs", favIds, dayStart.toISOString()],
    queryFn: () => fetchOutagesWindow(dayStart.toISOString(), dayEnd.toISOString(), favIds),
    enabled: favIds.length > 0,
  });

  const dayForecasts = useQuery({
    queryKey: ["forecasts-day-favs", favIds, dayStart.toISOString().slice(0, 10), showForecasts],
    queryFn: () => fetchForecastsRange(
      dayStart.toISOString().slice(0, 10),
      dayStart.toISOString().slice(0, 10),
      favIds,
    ),
    enabled: favIds.length > 0 && showForecasts,
  });

  const [pickerCommune, setPickerCommune] = useState("");

  async function addFav() {
    if (!pickerCommune) return;
    if (reachedLimit) {
      toast.error(`Limite de ${caps.maxCommunes} commune(s) atteinte sur votre ${tierLabel}.`);
      return;
    }
    const position = (favs.data?.length ?? 0);
    const { error } = await supabase.from("user_communes").insert({ user_id: user!.id, commune_id: pickerCommune, position });
    if (error) return toast.error(error.message);
    setPickerCommune("");
    qc.invalidateQueries({ queryKey: ["favs"] });
    toast.success("Commune ajoutée à vos favoris");
  }

  async function removeFav(id: string) {
    const { error } = await supabase.from("user_communes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["favs"] });
  }

  const available = (communes.data ?? []).filter((c) => !favIds.includes(c.id));
  const isFutureDay = dayStart.getTime() > Date.now();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Mes communes</h1>
            <p className="text-sm text-muted-foreground">Statut en direct et timeline du jour pour vos communes favorites.</p>
          </div>
          <div className="rounded-full border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Quota : </span>
            <strong>{favIds.length} / {caps.maxCommunes}</strong>{" "}
            <span className="text-muted-foreground">commune{caps.maxCommunes > 1 ? "s" : ""} · {tierLabel}</span>
          </div>
        </header>

        {/* Bandeau statut essai */}
        {trialActive && trialEndsAt && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="flex-1">
              <strong>Essai Pro actif</strong> — expire le{" "}
              {new Date(trialEndsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.
              Vous bénéficiez de toutes les fonctionnalités Pro.
            </p>
            <Link to="/abonnements" className="text-xs font-semibold text-primary underline">Confirmer Pro</Link>
          </div>
        )}
        {trialExpired && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm flex items-center gap-3">
            <Lock className="h-4 w-4 text-warning shrink-0" />
            <p className="flex-1">
              Votre essai Pro est <strong>expiré</strong>. Vous êtes revenu au plan gratuit.
            </p>
            <Link to="/abonnements" className="text-xs font-semibold text-primary underline">Reprendre Pro</Link>
          </div>
        )}
        {tier === "free" && !trialExpired && (
          <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-4 text-sm flex flex-wrap items-center gap-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="flex-1 min-w-[200px]">
              <strong>Essayez Pro gratuitement pendant 7 jours.</strong>{" "}
              <span className="text-muted-foreground">Sans carte bancaire, sans engagement.</span>
            </p>
            <Button onClick={handleStartTrial} size="sm" className="bg-gradient-ocean text-primary-foreground">
              Démarrer mon essai
            </Button>
          </div>
        )}

        {/* Picker */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Ajouter une commune
              </label>
              <select
                value={pickerCommune}
                onChange={(e) => setPickerCommune(e.target.value)}
                disabled={reachedLimit}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Choisir…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={addFav}
              disabled={reachedLimit || !pickerCommune}
              className="bg-gradient-ocean text-primary-foreground disabled:opacity-50"
            >
              {reachedLimit ? <><Lock className="h-4 w-4 mr-1" />Limite atteinte</> : <><Plus className="h-4 w-4 mr-1" />Ajouter</>}
            </Button>
          </div>
          {reachedLimit && tier === "free" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Plan gratuit : 1 commune maximum.{" "}
              <Link to="/abonnements" className="text-primary underline font-medium">
                Passez à Pro
              </Link>{" "}
              pour suivre jusqu'à {PLAN_CAPS.pro.maxCommunes} communes.
            </p>
          )}
        </div>

        {/* Status cards */}
        {favs.data && favs.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Vous n'avez pas encore de commune favorite.
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-4">
          {(favs.data ?? []).map((f) => {
            const c = (f as any).communes;
            const cur = (ongoing.data ?? []).find((o) => o.commune_id === f.commune_id) ?? null;
            return (
              <div key={f.id} className="relative">
                <CurrentStatusCard communeName={c?.name ?? "—"} outage={cur as any} />
                <button onClick={() => removeFav(f.id)} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive" aria-label="Retirer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        {favIds.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Timeline</h2>
              {isFutureDay && !showForecasts && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" /> Prévisions réservées au plan Pro
                </span>
              )}
            </div>
            <DayPicker
              selected={selectedDay}
              onChange={setSelectedDay}
              forwardDays={showForecasts ? forecastDays : 0}
              backDays={0}
            />
            <DayTimeline
              date={selectedDay}
              outages={dayOutages.data ?? []}
              forecasts={dayForecasts.data ?? []}
              showForecasts={showForecasts}
              lockedAfterNow={!showForecasts}
              lockedCtaText="Essai gratuit Pro 7j · sans CB"
              lockedCtaTo="/abonnements"
              teaserPercentOfRest={0.2}
            />
            {isFutureDay && !showForecasts && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <Lock className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Prévisions à 14 jours</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Anticipez vos coupures grâce au moteur statistique.{" "}
                      <Link to="/abonnements" className="text-primary underline">Découvrir Pro</Link>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notifications panel — toggles visibles, certains verrouillés */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Notifications</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Choisissez comment être alerté. Les canaux SMS, WhatsApp et préventifs sont réservés aux plans payants.
          </p>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                Email <span className="text-[11px] text-muted-foreground">(inclus)</span>
              </span>
              <input type="checkbox" defaultChecked className="h-4 w-7 accent-primary" />
            </label>
            {caps.smsEnabled
              ? <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm">
                  <span>SMS</span>
                  <input type="checkbox" className="h-4 w-7 accent-primary" />
                </label>
              : <LockedFeature label="SMS" variant="toggle" />}
            {caps.whatsappEnabled
              ? <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm">
                  <span>WhatsApp</span>
                  <input type="checkbox" className="h-4 w-7 accent-primary" />
                </label>
              : <LockedFeature label="WhatsApp" variant="toggle" />}
            {caps.preventiveNotifications
              ? <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm">
                  <span>Notifications préventives (avant coupure)</span>
                  <input type="checkbox" className="h-4 w-7 accent-primary" />
                </label>
              : <LockedFeature label="Notifications préventives (avant coupure)" variant="toggle" />}
          </div>
        </section>

        <UpsellCard tier={tier} />
      </div>
    </AppShell>
  );
}
