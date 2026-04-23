import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Vérifie les prévisions à venir et détermine quels users devraient recevoir
 * une notification préventive. Pour l'instant : log seulement (pas de provider
 * SMS/Email branché). À brancher avec Resend/Twilio plus tard.
 */
export async function checkPreventiveNotifications(): Promise<{ candidates: number }> {
  const now = new Date();
  const horizonHours = 48; // on regarde les 48h à venir
  const horizon = new Date(now.getTime() + horizonHours * 3600_000);

  // 1. Charger les prévisions à venir avec proba significative
  const { data: forecasts } = await supabaseAdmin
    .from("forecasts")
    .select("commune_id, forecast_date, window_start, window_end, probability")
    .gte("forecast_date", now.toISOString().slice(0, 10))
    .lte("forecast_date", horizon.toISOString().slice(0, 10))
    .gte("probability", 0.4);

  if (!forecasts || forecasts.length === 0) return { candidates: 0 };

  // 2. Charger les users avec préférences préventives + leurs communes
  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, preventive_hours_before, notify_preventive, email_enabled");

  const optedIn = (prefs ?? []).filter((p) => p.notify_preventive && p.email_enabled);
  if (optedIn.length === 0) return { candidates: 0 };

  const userIds = optedIn.map((p) => p.user_id);
  const { data: userCommunes } = await supabaseAdmin
    .from("user_communes")
    .select("user_id, commune_id")
    .in("user_id", userIds);

  // 3. Match : pour chaque (user, commune), chercher les forecasts dans la fenêtre H-X
  const byUserCommune = new Map<string, Set<string>>();
  for (const uc of userCommunes ?? []) {
    const set = byUserCommune.get(uc.user_id) ?? new Set<string>();
    set.add(uc.commune_id);
    byUserCommune.set(uc.user_id, set);
  }

  let candidates = 0;
  for (const pref of optedIn) {
    const communes = byUserCommune.get(pref.user_id);
    if (!communes) continue;
    const leadMs = (pref.preventive_hours_before ?? 24) * 3600_000;
    const lead = new Date(now.getTime() + leadMs);

    for (const f of forecasts) {
      if (!communes.has(f.commune_id)) continue;
      // Fenêtre cible : forecasts dans [now, lead]
      const fDate = new Date(`${f.forecast_date}T${f.window_start ?? "00:00:00"}`);
      if (fDate >= now && fDate <= lead) candidates++;
    }
  }

  // TODO: brancher Resend / Twilio ici quand le user activera Email/SMS
  console.log(`[preventive] ${candidates} notifications candidates`);
  return { candidates };
}