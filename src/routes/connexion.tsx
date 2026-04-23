import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Droplets } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import { useEffect } from "react";

export const Route = createFileRoute("/connexion")({
  component: ConnexionPage,
  head: () => ({
    meta: [
      { title: "Connexion · AquaGwada" },
      { name: "description", content: "Connectez-vous à AquaGwada pour gérer vos communes favorites et alertes." },
    ],
  }),
});

function ConnexionPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => { if (user) navigate({ to: "/ma-commune" }); }, [user, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Compte créé. Vérifiez votre email pour confirmer.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenue !");
        navigate({ to: "/ma-commune" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Une erreur est survenue");
    } finally { setBusy(false); }
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin + "/ma-commune" : undefined },
    });
    if (error) toast.error(error.message);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="text-center">
            <span className="grid h-12 w-12 mx-auto place-items-center rounded-xl bg-gradient-ocean shadow-soft">
              <Droplets className="h-6 w-6 text-primary-foreground" />
            </span>
            <h1 className="mt-3 font-display text-2xl font-semibold">{mode === "signin" ? "Se connecter" : "Créer un compte"}</h1>
            <p className="text-sm text-muted-foreground mt-1">Accès gratuit à vos communes favorites.</p>
          </div>

          <Button variant="outline" className="w-full mt-6" onClick={google} type="button">
            Continuer avec Google
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou par email <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Nom complet</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-gradient-ocean text-primary-foreground">
              {busy ? "Chargement…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Pas de compte ? " : "Déjà inscrit ? "}
            <button className="font-medium text-primary hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Créer un compte" : "Se connecter"}
            </button>
          </p>
        </div>
      </div>
    </AppShell>
  );
}