import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  component: CheckoutReturn,
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({ meta: [{ title: "Paiement confirmé · AquaGwada" }] }),
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  return (
    <AppShell>
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
        <h1 className="mt-6 font-display text-3xl font-bold">Merci, ton abonnement est actif !</h1>
        <p className="mt-3 text-muted-foreground">
          Tu peux maintenant suivre jusqu'à 5 communes, recevoir des notifications préventives
          et accéder à l'historique sur 1 an.
        </p>
        {session_id && (
          <p className="mt-2 text-xs text-muted-foreground">Référence : {session_id.slice(-12)}</p>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild className="bg-gradient-ocean text-primary-foreground">
            <Link to="/ma-commune">Aller à ma commune</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/abonnements">Retour aux abonnements</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}