import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getActivePushSubscription,
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
      getActivePushSubscription().then(async (sub) => {
        const perm = await getNotificationPermission();
        setEnabled(!!sub && perm === "granted");
      });
    }
  }, []);

  if (!supported) {
    return <p className="text-sm text-muted-foreground">Notifications push non supportees sur cet appareil.</p>;
  }
  if (preview) {
    return (
      <p className="text-sm text-muted-foreground">
        Pour activer les notifications, ouvre AquaGwada sur le site publie (pas dans l'editeur Lovable).
      </p>
    );
  }

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setEnabled(false);
        toast.success("Notifications desactivees");
      } else {
        const r = await subscribeToPush();
        if (r.ok) { setEnabled(true); toast.success("Notifications activees"); }
        else toast.error(r.reason ?? "Echec d'activation");
      }
    } finally { setBusy(false); }
  }

  return (
    <Button onClick={toggle} disabled={busy} variant={enabled ? "outline" : "default"} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {enabled ? "Desactiver les notifications push" : "Activer les notifications push"}
    </Button>
  );
}
