import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { getActivePushSubscription, getNotificationPermission, isPreviewContext, isPushSupported, subscribeToPush } from "@/lib/push-notifications";

const DISMISS_KEY = "aquagwada.push_onboarding.dismissed_at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 3600_000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function dismissedRecently(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

function rememberDismissal() {
  window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export function PushOnboardingPrompt() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function refresh() {
      if (loading || !user || isPreviewContext() || !isStandalone() || !isPushSupported() || dismissedRecently()) return;

      const { data } = await supabase
        .from("notification_preferences")
        .select("push_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.push_enabled === false) return;

      const [sub, perm] = await Promise.all([
        getActivePushSubscription(),
        getNotificationPermission(),
      ]);
      if (!alive) return;

      setSubscribed(!!sub);
      setPermission(perm);

      if (!sub && perm !== "denied") {
        timer = setTimeout(() => {
          if (alive) setOpen(true);
        }, 700);
      }
    }

    void refresh();
    window.addEventListener("aquagwada:push-subscription-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("aquagwada:push-subscription-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loading, user]);

  async function activate() {
    setBusy(true);
    try {
      const result = await subscribeToPush();
      const [sub, perm] = await Promise.all([
        getActivePushSubscription(),
        getNotificationPermission(),
      ]);
      setSubscribed(!!sub);
      setPermission(perm);
      window.dispatchEvent(new Event("aquagwada:push-subscription-changed"));

      if (result.ok) {
        window.localStorage.removeItem(DISMISS_KEY);
        toast.success("Notifications activees sur cet appareil.");
        setOpen(false);
      } else {
        toast.error(result.reason ?? "Notifications non activees sur cet appareil.");
      }
    } finally {
      setBusy(false);
    }
  }

  function later() {
    rememberDismissal();
    setOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) rememberDismissal();
    setOpen(nextOpen);
  }

  if (!user || subscribed || permission === "denied") return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Activer les alertes
          </DialogTitle>
          <DialogDescription>
            AquaGwada peut prevenir cet appareil pour les coupures de vos communes.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/25 p-4 text-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="h-4 w-4" />
            </span>
            <div>
              <p className="font-medium">Autoriser les notifications</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Le telephone affichera une demande d'autorisation. Choisissez Autoriser pour recevoir les alertes push.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={later}>
            Plus tard
          </Button>
          <Button type="button" onClick={activate} disabled={busy} className="gap-2 bg-gradient-ocean text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Autoriser
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
