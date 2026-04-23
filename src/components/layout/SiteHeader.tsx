import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Droplets, Menu, X } from "lucide-react";
import { useState } from "react";

const NAV = [
  { to: "/carte", label: "Carte" },
  { to: "/ma-commune", label: "Ma commune" },
  { to: "/abonnements", label: "Abonnements" },
] as const;

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-ocean shadow-soft">
            <Droplets className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">AquaGwada</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active = path === item.to || path.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/ma-commune">Mon espace</Link></Button>
              <Button size="sm" variant="outline" onClick={signOut}>Se déconnecter</Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/connexion">Connexion</Link></Button>
              <Button asChild size="sm" className="bg-gradient-ocean text-primary-foreground hover:opacity-90"><Link to="/connexion">Commencer</Link></Button>
            </>
          )}
        </div>

        <button className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border/60 px-4 py-3 space-y-1">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm hover:bg-secondary">{item.label}</Link>
          ))}
          <div className="pt-2">
            {user ? (
              <Button size="sm" variant="outline" className="w-full" onClick={signOut}>Se déconnecter</Button>
            ) : (
              <Button asChild size="sm" className="w-full bg-gradient-ocean text-primary-foreground"><Link to="/connexion">Connexion</Link></Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}