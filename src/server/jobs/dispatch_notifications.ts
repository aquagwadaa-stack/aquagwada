import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser, type PushPayload } from "@/server/notifications/send_push";
import { outageEmail, sendEmail } from "@/server/email/resend";
import { formatGuadeloupeDateTime, formatGuadeloupeTime, minutesInGuadeloupeDay } from "@/lib/timezone";

type NotificationKind = "outage_start" | "water_back" | "preventive" | "preventive_water_back";
type NotificationChannel = "push" | "email";

const BOGUS_SMGEAG_HOMEPAGE_URL = "https://www.smgeag.fr/";

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
  source: "official" | "scraping" | "user_report" | "forecast";
  source_url: string | null;
  created_at: string | null;
};

type ExistingNotificationLog = {
  id: string;
  dry_run: boolean;
};

type PushSubscriptionUserRow = {
  user_id: string;
};

const DEFAULT_NOTIFICATION_PREFS: Omit<Pref, "user_id"> = {
  email_enabled: false,
  sms_enabled: false,
  whatsapp_enabled: false,
  push_enabled: true,
  notify_outage_start: true,
  notify_water_back: true,
  notify_preventive: true,
  notify_preventive_water_back: false,
  preventive_hours_before: 24,
  preventive_water_back_hours_before: 1,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

function defaultPrefForUser(userId: string): Pref {
  return { user_id: userId, ...DEFAULT_NOTIFICATION_PREFS };
}

function inQuietHours(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end) return false;
  const cur = minutesInGuadeloupeDay(now);
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTrustedOutageSource(outage: Outage) {
  return outage.source_url !== BOGUS_SMGEAG_HOMEPAGE_URL;
}

function uniqueOutages(outages: Outage[]): Outage[] {
  const seen = new Set<string>();
  const unique: Outage[] = [];
  for (const outage of outages) {
    if (seen.has(outage.id)) continue;
    seen.add(outage.id);
    unique.push(outage);
  }
  return unique;
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

function timingWindowMs(hoursBefore: number) {
  if (!Number.isFinite(hoursBefore) || hoursBefore <= 0) return 0;
  return hoursBefore * 3600_000;
}

function isInCatchUpWindow(targetIso: string | null, hoursBefore: number, now: Date) {
  if (!targetIso) return false;
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) return false;

  const nowMs = now.getTime();
  const leadMs = timingWindowMs(hoursBefore);
  return leadMs > 0 && targetMs > nowMs && nowMs >= targetMs - leadMs;
}

function insideUserTimingWindow(pref: Pref, outage: Outage, kind: NotificationKind, now: Date) {
  if (kind === "preventive") {
    return isInCatchUpWindow(outage.starts_at, pref.preventive_hours_before, now);
  }
  if (kind === "preventive_water_back") {
    return isInCatchUpWindow(outage.ends_at, pref.preventive_water_back_hours_before, now);
  }
  return true;
}

async function getExistingNotificationLog(
  userId: string,
  outageId: string,
  channel: NotificationChannel,
  kind: NotificationKind,
): Promise<ExistingNotificationLog | null> {
  const { data, error } = await supabaseAdmin
    .from("notification_logs")
    .select("id, dry_run")
    .eq("user_id", userId)
    .eq("outage_id", outageId)
    .eq("channel", channel)
    .eq("kind", kind)
    .maybeSingle();

  if (error) {
    console.warn("[dispatch_notifications] log lookup error", error.message);
    return null;
  }

  return (data as ExistingNotificationLog | null) ?? null;
}

function buildPayload(kind: NotificationKind, outage: Outage, communeName: string): PushPayload {
  const titles: Record<NotificationKind, string> = {
    outage_start: `Coupure d'eau a ${communeName}`,
    water_back: `Eau de retour a ${communeName}`,
    preventive: `Coupure prevue a ${communeName}`,
    preventive_water_back: `Eau bientot de retour a ${communeName}`,
  };
  const bodies: Record<NotificationKind, string> = {
    outage_start: outage.source === "user_report"
      ? "Une coupure est signalee. Suivez l'evolution dans l'app."
      : "Une coupure vient de debuter. Suivez l'evolution dans l'app.",
    water_back: "L'eau a ete retablie. Pensez a purger les premiers litres.",
    preventive: `Coupure planifiee le ${formatGuadeloupeDateTime(outage.starts_at)} (heure Guadeloupe).`,
    preventive_water_back: `Retour de l'eau prevu vers ${outage.ends_at ? formatGuadeloupeTime(outage.ends_at) : "--"} (heure Guadeloupe).`,
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
  sent: number;
  dry_run: number;
  errors: number;
  defaulted_prefs: number;
}> {
  const now = new Date();
  const startLookbackIso = new Date(now.getTime() - 30 * 60_000).toISOString();
  const endLookbackIso = new Date(now.getTime() - 90 * 60_000).toISOString();

  const { data: started } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status, source, source_url, created_at")
    .gte("starts_at", startLookbackIso)
    .lte("starts_at", now.toISOString())
    .neq("status", "cancelled")
    .neq("status", "resolved");

  const { data: recentlyDiscovered } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status, source, source_url, created_at")
    .gte("created_at", startLookbackIso)
    .lte("created_at", now.toISOString())
    .eq("source", "user_report")
    .eq("status", "ongoing");

  const { data: ended } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status, source, source_url, created_at")
    .gte("ends_at", endLookbackIso)
    .lte("ends_at", now.toISOString())
    .neq("status", "cancelled");

  const futureMaxIso = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const { data: scheduled } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status, source, source_url, created_at")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", futureMaxIso)
    .neq("status", "cancelled")
    .neq("status", "resolved");

  const wbMaxIso = new Date(now.getTime() + 6 * 3600_000).toISOString();
  const { data: aboutToEnd } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status, source, source_url, created_at")
    .lte("starts_at", now.toISOString())
    .gte("ends_at", now.toISOString())
    .lte("ends_at", wbMaxIso)
    .neq("status", "cancelled")
    .neq("status", "resolved");

  let candidates = 0;
  let logged = 0;
  let skipped = 0;
  let sentCount = 0;
  let dryRunCount = 0;
  let errors = 0;
  let defaultedPrefs = 0;

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
      const { data: pushRows } = await supabaseAdmin
        .from("push_subscriptions")
        .select("user_id")
        .in("user_id", userIds);
      const prefByUser = new Map(((prefsRows ?? []) as Pref[]).map((pref) => [pref.user_id, pref]));
      const pushUserIds = new Set(((pushRows ?? []) as PushSubscriptionUserRow[]).map((row) => row.user_id));
      const prefs = userIds.flatMap((userId) => {
        const pref = prefByUser.get(userId);
        if (pref) return [pref];
        if (!pushUserIds.has(userId)) return [];
        defaultedPrefs += 1;
        return [defaultPrefForUser(userId)];
      });

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
          const existingLog = await getExistingNotificationLog(pref.user_id, outage.id, channel, kind);
          if (existingLog && !existingLog.dry_run) {
            skipped += 1;
            continue;
          }

          let sent = false;
          let note = "";

          if (channel === "push") {
            try {
              const result = await sendPushToUser(pref.user_id, payload);
              sent = result.sent > 0;
              const detail = result.lastError ? `, ${result.lastError}` : "";
              note = `push ${sent ? "envoye" : "non envoye"} via VAPID (${result.sent} appareil notifie, ${result.removed} abonnement expire retire, ${result.failed} echec${result.failed > 1 ? "s" : ""}${detail})`;
            } catch (error) {
              sent = false;
              note = `push non envoye: ${errorMessage(error)}`;
              console.warn("[dispatch_notifications] push error", error);
            }
          }

          if (channel === "email") {
            const email = await getUserEmail(pref.user_id);
            if (!email) {
              sent = false;
              note = "email non envoye: aucun email utilisateur";
            } else {
              const result = await sendEmail({ to: email, ...outageEmail(payload.title, payload.body) });
              sent = result.ok;
              note = result.ok ? "email mis en file via AquaGwada Emails" : `email non envoye: ${result.error}`;
            }
          }

          const logRow = {
            user_id: pref.user_id,
            outage_id: outage.id,
            channel,
            kind,
            dry_run: !sent,
            sent_at: new Date().toISOString(),
            payload: {
              commune_id: outage.commune_id,
              starts_at: outage.starts_at,
              ends_at: outage.ends_at,
              note,
            },
          };

          const { error } = existingLog
            ? await supabaseAdmin.from("notification_logs").update(logRow).eq("id", existingLog.id)
            : await supabaseAdmin.from("notification_logs").insert(logRow);

          if (!error) {
            logged += 1;
            if (sent) sentCount += 1;
            else dryRunCount += 1;
          } else if (
            String(error.message).toLowerCase().includes("duplicate")
            || String(error.message).toLowerCase().includes("unique")
            || error.code === "23505"
          ) {
            skipped += 1;
          } else {
            errors += 1;
            console.error("[dispatch_notifications] log write error:", error.message);
          }
        }
      }
    }
  }

  await processGroup(uniqueOutages([
    ...((started ?? []) as Outage[]),
    ...((recentlyDiscovered ?? []) as Outage[]),
  ]).filter(isTrustedOutageSource), "outage_start");
  await processGroup(((ended ?? []) as Outage[]).filter(isTrustedOutageSource), "water_back");
  await processGroup(((scheduled ?? []) as Outage[]).filter(isTrustedOutageSource), "preventive");
  await processGroup(((aboutToEnd ?? []) as Outage[]).filter(isTrustedOutageSource), "preventive_water_back");

  return { ok: errors === 0, candidates, logged, skipped, sent: sentCount, dry_run: dryRunCount, errors, defaulted_prefs: defaultedPrefs };
}
