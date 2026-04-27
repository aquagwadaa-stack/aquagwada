import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VAPID_PUBLIC_KEY } from "@/lib/vapid";

/** Cle publique VAPID - exposee volontairement (equivalent d'un identifiant public). */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function subscriptionUsesCurrentVapidKey(sub: PushSubscription): boolean {
  const appServerKey = sub.options.applicationServerKey;
  if (!appServerKey) return false;
  return bytesEqual(new Uint8Array(appServerKey), urlBase64ToUint8Array(VAPID_PUBLIC_KEY));
}

async function removeStoredSubscription(endpoint: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

/** Detecte les contextes ou il NE faut PAS enregistrer le SW (preview Lovable). */
export function isPreviewContext(): boolean {
  if (typeof window === "undefined") return true;
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const host = window.location.hostname;
  return inIframe || host.includes("lovableproject.com") || host.includes("id-preview--");
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported() || isPreviewContext()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("[push] SW register failed", e);
    return null;
  }
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported() || isPreviewContext()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;

  if (!subscriptionUsesCurrentVapidKey(sub)) {
    await removeStoredSubscription(sub.endpoint);
    await sub.unsubscribe();
    return null;
  }

  return sub;
}

/** Demande permission + souscrit + sauvegarde en BDD. */
export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "Notifications non supportees sur cet appareil" };
  if (isPreviewContext()) return { ok: false, reason: "Ouvre AquaGwada sur le site publie pour activer les notifications" };

  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permission refusee" };

  const currentSub = await getActivePushSubscription();
  const sub = currentSub ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Connecte-toi pour activer les notifications" };

  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) return { ok: false, reason: error.message };

  await supabase.from("notification_preferences").update({ push_enabled: true }).eq("user_id", user.id);
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("notification_preferences").update({ push_enabled: false }).eq("user_id", user.id);
  }
}
