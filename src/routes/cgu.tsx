import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/cgu")({
  component: CGU,
  head: () => ({ meta: [{ title: "CGU · AquaGwada" }, { name: "description", content: "Conditions générales d'utilisation d'AquaGwada." }] }),
});

function CGU() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 prose prose-slate">
        <h1 className="font-display text-3xl font-bold">Conditions Générales d'Utilisation</h1>
        <p className="text-muted-foreground">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>
        <h2>1. Objet</h2>
        <p>AquaGwada est un service d'information sur les coupures d'eau en Guadeloupe. Les données sont fournies à titre indicatif.</p>
        <h2>2. Limitation de responsabilité</h2>
        <p>Les informations sont issues de sources publiques, officielles et de signalements d'utilisateurs. Aucune garantie d'exactitude ni d'exhaustivité.</p>
        <h2>3. Compte utilisateur</h2>
        <p>L'utilisateur est responsable de la sécurité de ses identifiants.</p>
        <h2>4. Abonnements</h2>
        <p>Les abonnements payants sont régis par leurs conditions spécifiques. Essai gratuit Pro de 7 jours sans carte, arrêt automatique en l'absence d'engagement.</p>
      </article>
    </AppShell>
  );
}