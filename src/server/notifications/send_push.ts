import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_VAPID_PUBLIC_KEY } from "@/lib/vapid";

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSendResult = {
  sent: number;
  removed: number;
  failed: number;
  lastError?: string;
};

function configure() {
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:aqua.gwadaa@gmail.com";

  if (!priv) {
    throw new Error("VAPID_PRIVATE_KEY missing in Lovable secrets");
  }

  webpush.setVapidDetails(sub, pub, priv);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

/** Envoie une notif push a un utilisateur sur tous ses appareils inscrits. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushSendResult> {
  configure();
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, removed: 0, failed: 0, lastError: "aucun appareil abonne" };

  let sent = 0;
  let removed = 0;
  let failed = 0;
  let lastError: string | undefined;
  const json = JSON.stringify(payload);

  await Promise.all(((subs ?? []) as PushSubscriptionRow[]).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json,
        { TTL: 3600 }
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const message = e instanceof Error ? e.message : String(e);
      if (status === 404 || status === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
        lastError = `abonnement expire retire (${status})`;
      } else {
        failed++;
        lastError = status ? `echec push HTTP ${status}: ${message}` : `echec push: ${message}`;
        console.warn("[push] send failed", status, e);
      }
    }
  }));

  return { sent, removed, failed, lastError };
}
