import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function configure() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:aqua.gwadaa@gmail.com";
  if (!pub || !priv) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(sub, pub, priv);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

/** Envoie une notif push à un utilisateur sur tous ses appareils inscrits. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  configure();
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  const json = JSON.stringify(payload);

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json,
        { TTL: 3600 }
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      } else {
        console.warn("[push] send failed", status, e);
      }
    }
  }));

  return { sent, removed };
}
