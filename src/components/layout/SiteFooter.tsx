import { Link } from "@tanstack/react-router";
import { Droplets, Mail } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-4">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-ocean">
              <Droplets className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="font-display font-semibold">AquaGwada</span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">
            Le suivi des coupures d'eau en Guadeloupe, en temps réel.
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Produit</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/carte" className="hover:text-foreground text-muted-foreground">Carte</Link></li>
            <li><Link to="/ma-commune" className="hover:text-foreground text-muted-foreground">Ma commune</Link></li>
            <li><Link to="/abonnements" className="hover:text-foreground text-muted-foreground">Abonnements</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Légal</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/cgu" className="hover:text-foreground text-muted-foreground">CGU</Link></li>
            <li><Link to="/confidentialite" className="hover:text-foreground text-muted-foreground">Confidentialité</Link></li>
            <li><Link to="/a-propos" className="hover:text-foreground text-muted-foreground">À propos</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Contact</p>
          <a
            href="mailto:aqua.gwadaa@gmail.com"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
          >
            <Mail className="h-4 w-4" />
            aqua.gwadaa@gmail.com
          </a>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            Une question, un partenariat ou une correction de donnée ? Écrivez-nous directement.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-8">
        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Avertissement</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Les données présentées sont indicatives et issues de sources publiques, officielles et de signalements citoyens. Vérifiez auprès de votre fournisseur d'eau.
          </p>
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} AquaGwada — Fait en Guadeloupe 🇬🇵
      </div>
    </footer>
  );
}
