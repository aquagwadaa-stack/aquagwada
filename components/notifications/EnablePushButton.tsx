import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  isPushSupported,
  isPreviewContext,
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPermission,
} from "@/lib/push-notifications";

export function EnablePushButton() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setSupported(isPushSupported());
    setPreview(isPreviewContext());
    if (isPushSupported() && !isPreviewContext()) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        const perm = await getNotificationPermission();
        setEnabled(!!sub && perm === "granted");
      });
    }
  }, []);

  if (!supported) {
    return <p className="text-sm text-muted-foreground">Notifications push non supportées sur cet appareil.</p>;
  }
  if (preview) {
    return (
      <p className="text-sm text-muted-foreground">
        Pour activer les notifications, ouvre AquaGwada sur le site publié (pas dans l'éditeur Lovable).
      </p>
    );
  }

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setEnabled(false);
        toast.success("Notifications désactivées");
      } else {
        const r = await subscribeToPush();
        if (r.ok) { setEnabled(true); toast.success("Notifications activées 🔔"); }
        else toast.error(r.reason ?? "Échec d'activation");
      }
    } finally { setBusy(false); }
  }

  return (
    <Button onClick={toggle} disabled={busy} variant={enabled ? "outline" : "default"} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {enabled ? "Désactiver les notifications push" : "Activer les notifications push"}
    </Button>
  );
}