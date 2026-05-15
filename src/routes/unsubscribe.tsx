import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  head: () => ({ meta: [{ title: "Désabonnement · AquaGwada" }] }),
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "valid" | "done" | "already" | "invalid" | "error">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("valid");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  async function confirm() {
    setBusy(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d.success) setState("done");
      else if (d.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold mb-4">Désabonnement AquaGwada</h1>
        {state === "loading" && <p className="text-muted-foreground">Vérification…</p>}
        {state === "invalid" && <p className="text-muted-foreground">Lien invalide ou expiré.</p>}
        {state === "error" && <p className="text-destructive">Une erreur est survenue. Réessayez plus tard.</p>}
        {state === "already" && <p className="text-muted-foreground">Vous êtes déjà désabonné.</p>}
        {state === "valid" && (
          <>
            <p className="text-muted-foreground mb-6">Confirmer le désabonnement aux emails AquaGwada ?</p>
            <Button onClick={confirm} disabled={busy}>Confirmer le désabonnement</Button>
          </>
        )}
        {state === "done" && <p className="text-success-foreground">Désabonnement confirmé. Vous ne recevrez plus d'emails.</p>}
      </div>
    </AppShell>
  );
}