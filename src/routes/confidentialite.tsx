import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/confidentialite")({
  component: Privacy,
  head: () => ({ meta: [{ title: "Confidentialité · AquaGwada" }, { name: "description", content: "Politique de confidentialité d'AquaGwada." }] }),
});

function Privacy() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 prose prose-slate">
        <h1 className="font-display text-3xl font-bold">Politique de confidentialité</h1>
        <p className="text-muted-foreground">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>
        <h2>Données collectées</h2>
        <ul>
          <li>Email, nom, et préférences de notifications.</li>
          <li>Communes favorites et historique de signalements.</li>
        </ul>
        <h2>Finalités</h2>
        <p>Fournir le service, les alertes et améliorer la qualité des données.</p>
        <h2>Vos droits (RGPD)</h2>
        <p>Accès, rectification, suppression — par email à privacy@aquagwada.app.</p>
      </article>
    </AppShell>
  );
}