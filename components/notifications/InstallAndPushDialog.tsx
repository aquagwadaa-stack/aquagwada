import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Bell, Share, Plus, CheckCircle2 } from "lucide-react";
import { isPushSupported, isPreviewContext, subscribeToPush, getNotificationPermission } from "@/lib/push-notifications";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

/**
 * Modale qui guide l'utilisateur :
 *  - Installer l'app (PWA) si pas déjà fait
 *  - Activer les notifications push
 *  - Continuer la sauvegarde de ses préférences
 *
 * `onContinue` est appelé quand l'utilisateur veut sauvegarder (avec ou sans install).
 */
export function InstallAndPushDialog({
  open,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onContinue: () => void;
}) {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const ios = isIOS();
  const preview = isPreviewContext();

  useEffect(() => {
    setInstalled(isStandalone());
    if (isPushSupported() && !preview) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        const perm = await getNotificationPermission();
        setPushOn(!!sub && perm === "granted");
      });
    }
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [preview, open]);

  async function handleInstall() {
    if (!installEvt) return;
    await installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      toast.success("App installée 🎉");
    }
  }

  async function handleEnablePush() {
    setBusy(true);
    try {
      const r = await subscribeToPush();
      if (r.ok) { setPushOn(true); toast.success("Notifications activées 🔔"); }
      else toast.error(r.reason ?? "Échec d'activation");
    } finally { setBusy(false); }
  }

  function handleSaveAnyway() {
    onContinue();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Pour recevoir tes alertes en temps réel
          </DialogTitle>
          <DialogDescription>
            On a besoin de 2 toutes petites étapes pour que les notifications fonctionnent <strong>même quand l'app est fermée</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Étape 1 : installer */}
          <div className={`rounded-xl border p-4 ${installed ? "border-success/40 bg-success/5" : "border-border bg-muted/30"}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${installed ? "bg-success/20 text-success" : "bg-primary/15 text-primary"}`}>
                {installed ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-sm font-semibold">1</span>}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {installed ? "App installée ✓" : "Installer AquaGwada sur ton téléphone"}
                </p>
                {!installed && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">
                      C'est gratuit, ça prend 5 secondes, <strong>pas besoin de l'App Store ni de Google Play</strong>. L'app s'ajoute juste sur ton écran d'accueil.
                    </p>
                    {ios ? (
                      <div className="mt-3 rounded-lg bg-card border border-border p-3 text-xs space-y-1.5">
                        <p className="font-medium text-foreground">Sur iPhone (Safari) :</p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Share className="h-3.5 w-3.5 text-primary" /> Touche le bouton <strong>Partager</strong> en bas
                        </p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Plus className="h-3.5 w-3.5 text-primary" /> Choisis <strong>« Sur l'écran d'accueil »</strong>
                        </p>
                      </div>
                    ) : installEvt ? (
                      <Button size="sm" onClick={handleInstall} className="mt-3 gap-2">
                        <Smartphone className="h-4 w-4" /> Installer maintenant
                      </Button>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground italic">
                        Sur Android Chrome : ouvre le menu ⋮ → « Installer l'application ». Sur ordinateur : icône d'install dans la barre d'adresse.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Étape 2 : activer push */}
          <div className={`rounded-xl border p-4 ${pushOn ? "border-success/40 bg-success/5" : "border-border bg-muted/30"}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${pushOn ? "bg-success/20 text-success" : "bg-primary/15 text-primary"}`}>
                {pushOn ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-sm font-semibold">2</span>}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {pushOn ? "Notifications activées ✓" : "Autoriser les notifications"}
                </p>
                {!pushOn && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ton téléphone va te demander l'autorisation d'envoyer des notifications. Touche <strong>« Autoriser »</strong>.
                    </p>
                    <Button size="sm" onClick={handleEnablePush} disabled={busy || preview} className="mt-3 gap-2">
                      <Bell className="h-4 w-4" /> {busy ? "…" : "Activer les notifications"}
                    </Button>
                    {preview && (
                      <p className="mt-2 text-[11px] text-muted-foreground italic">
                        ⚠️ Disponible uniquement sur le site publié (aquagwada.fr), pas dans cet aperçu.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleSaveAnyway}>
            Plus tard, sauvegarder quand même
          </Button>
          <Button onClick={handleSaveAnyway} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Sauvegarder mes préférences
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
