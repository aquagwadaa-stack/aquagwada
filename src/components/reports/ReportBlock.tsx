import { useEffect, useMemo, useState } from "react";
import { Megaphone, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunes } from "@/lib/queries/communes";
import { ReportDialog } from "./ReportDialog";
import { useAuth } from "@/providers/AuthProvider";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bloc CTA visible "Signaler maintenant".
 * - Sélecteur de commune intégré (présélectionne la favorite si dispo).
 * - Si non connecté : redirige vers /connexion.
 */
export function ReportBlock({ defaultCommuneId, compact = false }: { defaultCommuneId?: string; compact?: boolean }) {
  const { user } = useAuth();
  const communes = useQuery({ queryKey: ["communes"], queryFn: fetchCommunes });

  const favs = useQuery({
    queryKey: ["favs-min", user?.id ?? "anon"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_communes")
        .select("commune_id")
        .eq("user_id", user!.id)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const [pick, setPick] = useState<string>("");

  useEffect(() => {
    if (pick) return;
    if (defaultCommuneId) {
      setPick(defaultCommuneId);
      return;
    }
    const fav = favs.data?.[0]?.commune_id;
    if (fav) setPick(fav);
  }, [defaultCommuneId, favs.data, pick]);

  const selected = useMemo(
    () => (communes.data ?? []).find((c) => c.id === pick),
    [communes.data, pick],
  );

  return (
    <div className={`rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/5 to-primary/5 ${compact ? "p-3" : "p-4"} shadow-soft`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
          <Megaphone className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-sm font-semibold leading-tight">Signaler maintenant</p>
          <p className="text-[11px] text-muted-foreground leading-tight">Aidez vos voisins en 10 secondes</p>
        </div>
      </div>

      {!user ? (
        <Link
          to="/connexion"
          className="block w-full text-center rounded-lg bg-accent text-accent-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition"
        >
          Se connecter pour signaler
        </Link>
      ) : (
        <>
          <label className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
            <MapPin className="h-3 w-3" /> Commune concernée
          </label>
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm mb-2"
          >
            <option value="">Choisir…</option>
            {(communes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {pick ? (
            <ReportDialog
              communeId={pick}
              communeName={selected?.name}
              triggerLabel="Signaler maintenant"
              fullWidth
            />
          ) : (
            <button
              disabled
              className="block w-full rounded-lg bg-muted text-muted-foreground px-3 py-2 text-sm font-medium cursor-not-allowed"
            >
              Choisir une commune
            </button>
          )}
        </>
      )}
    </div>
  );
}
