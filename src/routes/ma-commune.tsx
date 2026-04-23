import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/providers/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { fetchOngoingOutages, fetchOutagesByCommune, fetchOutagesWindow } from "@/lib/queries/outages";
import { CurrentStatusCard } from "@/components/outages/CurrentStatusCard";
import { DayTimeline } from "@/components/outages/Timeline";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Heart, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

  const ongoing = useQuery({
    queryKey: ["ongoing-favs", favIds],
    queryFn: fetchOngoingOutages,
    enabled: favIds.length > 0,
  });

  const today = new Date();
  const start = new Date(today); start.setHours(0,0,0,0);
  const end = new Date(today); end.setHours(23,59,59,999);
  const dayOutages = useQuery({
    queryKey: ["outages-today-favs", favIds, start.toISOString()],
    queryFn: () => fetchOutagesWindow(start.toISOString(), end.toISOString(), favIds),
    enabled: favIds.length > 0,
  });

  const [pickerCommune, setPickerCommune] = useState("");

  async function addFav() {
    if (!pickerCommune) return;
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

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-8">
        <header>
          <h1 className="font-display text-3xl font-bold">Mes communes</h1>
          <p className="text-sm text-muted-foreground">Statut en direct et timeline du jour pour vos communes favorites.</p>
        </header>

        {/* Picker */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Ajouter une commune</label>
              <select value={pickerCommune} onChange={(e) => setPickerCommune(e.target.value)} className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Choisir…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={addFav} className="bg-gradient-ocean text-primary-foreground"><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
          </div>
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
          <DayTimeline date={today} outages={dayOutages.data ?? []} />
        )}
      </div>
    </AppShell>
  );
}