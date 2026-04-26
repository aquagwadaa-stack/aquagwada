import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { fetchOngoingOutages } from "@/lib/queries/outages";
import { CurrentStatusCard } from "@/components/outages/CurrentStatusCard";
import { OutageTimeline } from "@/components/outages/OutageTimeline";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Heart, Plus, Trash2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PLAN_CAPS, type Tier } from "@/lib/subscription";
import { UpsellCard } from "@/components/upsell/LockedFeature";
import { fetchEffectiveSubscription, startProTrial } from "@/lib/queries/subscription";
import { NotificationPreferencesPanel } from "@/components/notifications/NotificationPreferencesPanel";
import { ReportBlock } from "@/components/reports/ReportBlock";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { useEffectiveTier } from "@/hooks/use-admin";

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
  const effectiveTier = useEffectiveTier();

  const subscription = useQuery({
    queryKey: ["subscription", user!.id],
    queryFn: () => fetchEffectiveSubscription(user!.id),
  });
  const tier: Tier = effectiveTier.tier;
  const trialActive = !!subscription.data?.trialActive;
  const trialExpired = !!subscription.data?.trialExpired;
  const trialEndsAt = subscription.data?.trialEndsAt ?? null;
  const caps = PLAN_CAPS[tier];
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
        .eq("user_id", user!.id)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const favIds = useMemo(() => (favs.data ?? []).map((f) => f.commune_id), [favs.data]);
  const favCommunes = useMemo(
    () =>
      (favs.data ?? [])
        .map((f: any) => f.communes)
        .filter((c: any): c is { id: string; name: string } => !!c && !!c.id && !!c.name),
    [favs.data]
  );
  const reachedLimit = favIds.length >= caps.maxCommunes;

  const ongoing = useQuery({
    queryKey: ["ongoing-favs", favIds.join(",")],
    queryFn: () => fetchOngoingOutages(favIds),
    enabled: favIds.length > 0,
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
    const { error } = await supabase.from("user_communes").delete().eq("id", id).eq("user_id", user!.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["favs"] });
  }

  const available = (communes.data ?? []).filter((c) => !favIds.includes(c.id));

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Mes communes</h1>
            <p className="text-sm text-muted-foreground">Statut en direct et frise chronologique pour vos communes favorites.</p>
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
            <Link to="/abonnements" className="text-xs font-semibold text-primary underline">Voir les options</Link>
          </div>
        )}
        {trialExpired && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm flex items-center gap-3">
            <Lock className="h-4 w-4 text-warning shrink-0" />
            <p className="flex-1">
              Votre essai Pro est <strong>expiré</strong>. Vous êtes revenu au plan gratuit.
            </p>
            <Link to="/abonnements" className="text-xs font-semibold text-primary underline">Voir Pro</Link>
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
                <CurrentStatusCard communeName={c?.name ?? "—"} outage={cur as any} communeId={f.commune_id} />
                <button onClick={() => removeFav(f.id)} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive" aria-label="Retirer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        {favIds.length > 0 && (
          <ReportBlock defaultCommuneId={favIds[0]} />
        )}

        {favIds.length > 0 && (
          <OutageTimeline
            tier={tier}
            mode="favorites"
            communes={favCommunes}
            visibleCount={3}
          />
        )}

        <NotificationPreferencesPanel tier={tier} />

        <HistoryPanel tier={tier} communeIds={favIds} />

        <UpsellCard tier={tier} />
      </div>
    </AppShell>
  );
}
