import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/a-propos")({
  component: About,
  head: () => ({ meta: [{ title: "À propos · AquaGwada" }, { name: "description", content: "AquaGwada, le suivi des coupures d'eau en Guadeloupe par et pour les Guadeloupéens." }] }),
});

function About() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <h1 className="font-display text-4xl font-bold">À propos</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          AquaGwada centralise les informations sur les coupures d'eau en Guadeloupe pour aider les habitants à mieux s'organiser au quotidien.
        </p>
        <p className="mt-4">
          Nous combinons des sources officielles (sites publics, communiqués) et la puissance des signalements citoyens, en toute transparence sur la fiabilité des données.
        </p>
        <div className="mt-8 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          ⚠️ Les informations affichées sont indicatives. Vérifiez toujours auprès de votre fournisseur d'eau pour des décisions critiques.
        </div>
      </article>
    </AppShell>
  );
}