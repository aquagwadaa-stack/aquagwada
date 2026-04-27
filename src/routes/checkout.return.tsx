import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { getStripeEnvironment } from "@/lib/stripe";
import { syncCheckoutSession } from "@/server/payments/checkout";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout/return")({
  component: CheckoutReturn,
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({ meta: [{ title: "Paiement confirme · AquaGwada" }] }),
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");

  useEffect(() => {
    if (!session_id || !user || syncState !== "idle") return;
    setSyncState("syncing");
    syncCheckoutSession({ data: { sessionId: session_id, environment: getStripeEnvironment() } })
      .then(() => {
        setSyncState("done");
        qc.invalidateQueries({ queryKey: ["subscription", user.id] });
        toast.success("Abonnement Pro active.");
      })
      .catch((error) => {
        console.warn("[checkout-return] sync failed", error);
        setSyncState("error");
        toast.message("Paiement confirme. La synchronisation peut prendre quelques secondes via Stripe.");
      });
  }, [qc, session_id, syncState, user]);

  return (
    <AppShell>
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
        <h1 className="mt-6 font-display text-3xl font-bold">Merci, ton paiement est confirme</h1>
        <p className="mt-3 text-muted-foreground">
          Ton abonnement Pro est en cours d'activation. Tu peux suivre jusqu'a 5 communes,
          recevoir les notifications preventives et consulter l'historique sur 1 an.
        </p>
        {syncState === "syncing" && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Synchronisation Stripe...
          </p>
        )}
        {syncState === "done" && (
          <p className="mt-4 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-success-foreground">
            Abonnement synchronise.
          </p>
        )}
        {syncState === "error" && (
          <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
            Le paiement est valide. Si Pro n'apparait pas encore, le webhook Stripe finira la synchronisation automatiquement.
          </p>
        )}
        {session_id && (
          <p className="mt-2 text-xs text-muted-foreground">Reference : {session_id.slice(-12)}</p>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild className="bg-gradient-ocean text-primary-foreground">
            <Link to="/ma-commune">Aller a ma commune</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/abonnements">Gerer l'abonnement</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
