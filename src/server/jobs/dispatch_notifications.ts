import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser, type PushPayload } from "@/server/notifications/send_push";
import { outageEmail, sendEmail } from "@/server/email/resend";

type NotificationKind = "outage_start" | "water_back" | "preventive" | "preventive_water_back";
type NotificationChannel = "push" | "email";

type Pref = {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
  notify_outage_start: boolean;
  notify_water_back: boolean;
  notify_preventive: boolean;
  notify_preventive_water_back: boolean;
  preventive_hours_before: number;
  preventive_water_back_hours_before: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

type Outage = {
  id: string;
  commune_id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
};

function inQuietHours(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

async function getUserEmail(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

function kindEnabled(pref: Pref, kind: NotificationKind) {
  if (kind === "outage_start") return pref.notify_outage_start;
  if (kind === "water_back") return pref.notify_water_back;
  if (kind === "preventive") return pref.notify_preventive;
  return pref.notify_preventive_water_back;
}

function insideUserTimingWindow(pref: Pref, outage: Outage, kind: NotificationKind, now: Date) {
  if (kind === "preventive") {
    const startMs = new Date(outage.starts_at).getTime();
    const targetMs = now.getTime() + pref.preventive_hours_before * 3600_000;
    return Math.abs(startMs - targetMs) <= 10 * 60_000;
  }
  if (kind === "preventive_water_back" && outage.ends_at) {
    const endMs = new Date(outage.ends_at).getTime();
    const targetMs = now.getTime() + pref.preventive_water_back_hours_before * 3600_000;
    return Math.abs(endMs - targetMs) <= 10 * 60_000;
  }
  return true;
}

function buildPayload(kind: NotificationKind, outage: Outage, communeName: string): PushPayload {
  const titles: Record<NotificationKind, string> = {
    outage_start: `Coupure d'eau a ${communeName}`,
    water_back: `Eau de retour a ${communeName}`,
    preventive: `Coupure prevue a ${communeName}`,
    preventive_water_back: `Eau bientot de retour a ${communeName}`,
  };
  const bodies: Record<NotificationKind, string> = {
    outage_start: "Une coupure vient de debuter. Suivez l'evolution dans l'app.",
    water_back: "L'eau a ete retablie. Pensez a purger les premiers litres.",
    preventive: `Coupure planifiee le ${new Date(outage.starts_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.`,
    preventive_water_back: `Retour de l'eau prevu vers ${outage.ends_at ? new Date(outage.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--"}.`,
  };
  return {
    title: titles[kind],
    body: bodies[kind],
    url: "/ma-commune",
    tag: `${kind}-${outage.id}`,
  };
}

export async function dispatchNotifications(): Promise<{
  ok: boolean;
  candidates: number;
  logged: number;
  skipped: number;
}> {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();

  const { data: started } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status")
    .gte("starts_at", fiveMinAgo)
    .lte("starts_at", now.toISOString())
    .neq("status", "cancelled")
    .neq("status", "resolved");

  const { data: ended } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status")
    .gte("ends_at", fiveMinAgo)
    .lte("ends_at", now.toISOString())
    .eq("status", "resolved");

  const futureMaxIso = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const { data: scheduled } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status")
    .eq("status", "scheduled")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", futureMaxIso);

  const wbMaxIso = new Date(now.getTime() + 6 * 3600_000).toISOString();
  const { data: aboutToEnd } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status")
    .eq("status", "ongoing")
    .gte("ends_at", now.toISOString())
    .lte("ends_at", wbMaxIso);

  let candidates = 0;
  let logged = 0;
  let skipped = 0;

  async function processGroup(outages: Outage[], kind: NotificationKind) {
    for (const outage of outages) {
      const { data: subs } = await supabaseAdmin
        .from("user_communes")
        .select("user_id")
        .eq("commune_id", outage.commune_id);
      if (!subs?.length) continue;

      const userIds = Array.from(new Set(subs.map((sub) => sub.user_id)));
      const { data: prefsRows } = await supabaseAdmin
        .from("notification_preferences")
        .select("*")
        .in("user_id", userIds);
      const prefs = (prefsRows ?? []) as Pref[];

      const commune = await supabaseAdmin.from("communes").select("name").eq("id", outage.commune_id).maybeSingle();
      const communeName = commune.data?.name ?? "votre commune";
      const payload = buildPayload(kind, outage, communeName);

      for (const pref of prefs) {
        candidates += 1;

        if (!kindEnabled(pref, kind)) {
          skipped += 1;
          continue;
        }
        if (!insideUserTimingWindow(pref, outage, kind, now)) {
          skipped += 1;
          continue;
        }
        if ((kind === "preventive" || kind === "preventive_water_back") && inQuietHours(pref.quiet_hours_start, pref.quiet_hours_end, now)) {
          skipped += 1;
          continue;
        }

        const channels: NotificationChannel[] = [];
        if (pref.push_enabled) channels.push("push");
        if (pref.email_enabled) channels.push("email");
        if (channels.length === 0) {
          skipped += 1;
          continue;
        }

        for (const channel of channels) {
          let sent = false;
          let note = "";

          if (channel === "push") {
            try {
              const result = await sendPushToUser(pref.user_id, payload);
              sent = result.sent > 0;
              note = `push ${sent ? "envoye" : "non envoye"} via VAPID (${result.sent} appareil notifie, ${result.removed} abonnement expire retire)`;
            } catch (error) {
              skipped += 1;
              console.warn("[dispatch_notifications] push error", error);
              continue;
            }
          }

          if (channel === "email") {
            const email = await getUserEmail(pref.user_id);
            if (!email) {
              skipped += 1;
              continue;
            }
            const result = await sendEmail({ to: email, ...outageEmail(payload.title, payload.body) });
            sent = result.ok;
            note = result.ok ? "email envoye via Resend" : `email non envoye: ${result.error}`;
          }

          const { error } = await supabaseAdmin.from("notification_logs").insert({
            user_id: pref.user_id,
            outage_id: outage.id,
            channel,
            kind,
            dry_run: !sent,
            payload: {
              commune_id: outage.commune_id,
              starts_at: outage.starts_at,
              ends_at: outage.ends_at,
              note,
            },
          });

          if (!error) logged += 1;
          else if (!String(error.message).toLowerCase().includes("duplicate")) {
            console.error("[dispatch_notifications] insert error:", error.message);
          }
        }
      }
    }
  }

  await processGroup((started ?? []) as Outage[], "outage_start");
  await processGroup((ended ?? []) as Outage[], "water_back");
  await processGroup((scheduled ?? []) as Outage[], "preventive");
  await processGroup((aboutToEnd ?? []) as Outage[], "preventive_water_back");

  return { ok: true, candidates, logged, skipped };
}
