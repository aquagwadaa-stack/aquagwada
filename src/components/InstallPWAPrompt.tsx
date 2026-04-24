import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPreviewContext } from "@/lib/push-notifications";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "aquagwada_install_dismissed_at";
const COOLDOWN_DAYS = 14;

export function InstallPWAPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isPreviewContext()) return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < COOLDOWN_DAYS * 86400_000) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setShow(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!show || !evt) return null;

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setShow(false);
    else { localStorage.setItem(DISMISS_KEY, String(Date.now())); setShow(false); }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg md:left-auto md:right-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-foreground">Installer AquaGwada</p>
          <p className="mt-1 text-xs text-muted-foreground">Accès rapide depuis ton écran d'accueil + notifications en temps réel.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={install}>Installer</Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>Plus tard</Button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Fermer" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}