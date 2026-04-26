import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser, type PushPayload } from "@/server/notifications/send_push";

/**
 * Job de dispatch des notifications.
 *
 * - Lit `notification_preferences` pour respecter strictement les choix utilisateurs.
 * - Idempotent grâce à `notification_logs` (UNIQUE user_id, outage_id, kind, channel).
 * - Push envoyé réellement via VAPID.
 * - Email/SMS/WhatsApp restent désactivés tant qu'un provider dédié n'est pas branché.
 *
 * Événements gérés :
 *  - outage_start  : coupure qui vient de débuter (≤ 5 min)
 *  - water_back    : coupure qui vient de se terminer (≤ 5 min)
 *  - preventive    : coupure prévue dans X heures (X = pref.preventive_hours_before)
 */

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
  return cur >= s || cur < e; // plage qui passe minuit
}

export async function dispatchNotifications(): Promise<{
  ok: boolean;
  candidates: number;
  logged: number;
  skipped: number;
  note?: string;
}> {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();

  // 1. Outages "outage_start" : ongoing ayant démarré dans les 5 dernières min
  const { data: started } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status")
    .gte("starts_at", fiveMinAgo)
    .lte("starts_at", now.toISOString())
    .neq("status", "cancelled")
    .neq("status", "resolved");

  // 2. water_back : resolved avec ends_at dans les 5 dernières min
  const { data: ended } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status")
    .gte("ends_at", fiveMinAgo)
    .lte("ends_at", now.toISOString())
    .eq("status", "resolved");

  // 3. preventive : scheduled qui démarre entre +1h et +48h
  const futureMaxIso = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const { data: scheduled } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, status")
    .eq("status", "scheduled")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", futureMaxIso);

  // 4. preventive_water_back : ongoing dont ends_at est entre +1h et +6h
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

  async function processGroup(outages: Outage[], kind: "outage_start" | "water_back" | "preventive" | "preventive_water_back") {
    for (const o of outages) {
      // Trouver les utilisateurs abonnés à cette commune
      const { data: subs } = await supabaseAdmin
        .from("user_communes")
        .select("user_id")
        .eq("commune_id", o.commune_id);
      if (!subs?.length) continue;
      const userIds = Array.from(new Set(subs.map((s) => s.user_id)));

      const { data: prefsRows } = await supabaseAdmin
        .from("notification_preferences")
        .select("*")
        .in("user_id", userIds);
      const prefs = (prefsRows ?? []) as Pref[];

      for (const p of prefs) {
        candidates += 1;

        // Filtrage par type d'événement
        if (kind === "outage_start" && !p.notify_outage_start) { skipped += 1; continue; }
        if (kind === "water_back" && !p.notify_water_back) { skipped += 1; continue; }
        if (kind === "preventive" && !p.notify_preventive) { skipped += 1; continue; }
        if (kind === "preventive_water_back" && !p.notify_preventive_water_back) { skipped += 1; continue; }

        // Préventif : respecter le délai souhaité (fenêtre ±10 min autour de pref.preventive_hours_before)
        if (kind === "preventive") {
          const startMs = new Date(o.starts_at).getTime();
          const targetMs = now.getTime() + p.preventive_hours_before * 3600_000;
          if (Math.abs(startMs - targetMs) > 10 * 60_000) { skipped += 1; continue; }
        }
        if (kind === "preventive_water_back" && o.ends_at) {
          const endMs = new Date(o.ends_at).getTime();
          const targetMs = now.getTime() + p.preventive_water_back_hours_before * 3600_000;
          if (Math.abs(endMs - targetMs) > 10 * 60_000) { skipped += 1; continue; }
        }

        // Heures silencieuses : respect côté DB si présent (UI les a retirées mais on conserve la logique)
        if ((kind === "preventive" || kind === "preventive_water_back") && inQuietHours(p.quiet_hours_start, p.quiet_hours_end, now)) {
          skipped += 1; continue;
        }

        const channels: Array<"push"> = [];
        if (p.push_enabled) channels.push("push");
        if (channels.length === 0) { skipped += 1; continue; }

        for (const ch of channels) {
          let pushResult: { sent: number; removed: number } | null = null;
          const commune = await supabaseAdmin.from("communes").select("name").eq("id", o.commune_id).maybeSingle();
          const communeName = commune.data?.name ?? "votre commune";
          const titles: Record<typeof kind, string> = {
            outage_start: `🚱 Coupure d'eau à ${communeName}`,
            water_back: `💧 Eau de retour à ${communeName}`,
            preventive: `⏰ Coupure prévue à ${communeName}`,
            preventive_water_back: `🔜 Eau bientôt de retour à ${communeName}`,
          };
          const bodies: Record<typeof kind, string> = {
            outage_start: `Une coupure vient de débuter. Suis l'évolution dans l'app.`,
            water_back: `L'eau a été rétablie. Pense à purger les premiers litres.`,
            preventive: `Coupure planifiée le ${new Date(o.starts_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.`,
            preventive_water_back: `Retour de l'eau prévu vers ${o.ends_at ? new Date(o.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}.`,
          };
          const payload: PushPayload = {
            title: titles[kind],
            body: bodies[kind],
            url: "/ma-commune",
            tag: `${kind}-${o.id}`,
          };
          try {
            pushResult = await sendPushToUser(p.user_id, payload);
          } catch (e) {
            skipped += 1;
            console.warn("[push] dispatch err", e);
            continue;
          }
          const pushSent = (pushResult?.sent ?? 0) > 0;
          const { error } = await supabaseAdmin.from("notification_logs").insert({
            user_id: p.user_id,
            outage_id: o.id,
            channel: ch,
            kind,
            dry_run: !pushSent,
            payload: {
              commune_id: o.commune_id,
              starts_at: o.starts_at,
              ends_at: o.ends_at,
              note: `push ${pushSent ? "envoyé" : "non envoyé"} via VAPID (${pushResult?.sent ?? 0} appareil notifié, ${pushResult?.removed ?? 0} abonnement expiré retiré)`,
            },
          });
          // Conflit unique = déjà envoyé, on saute silencieusement
          if (!error) logged += 1;
          else if (!String(error.message).includes("duplicate")) {
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
