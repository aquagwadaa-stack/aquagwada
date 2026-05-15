import { createFileRoute } from "@tanstack/react-router";
import { backfillPlanningHistory } from "@/server/jobs/scrape_planning";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guadeloupeDateTimeToUtc } from "@/lib/timezone";

type BackfillBody = {
  since?: string;
  maxPosts?: number;
};

type ManualGroup = {
  communeSlugs: string[];
  sector: string;
  dates: string[];
  start: string;
  end: string;
};

const CURRENT_MANUAL_SOURCE_URL = "https://www.smgeag.fr/2026/05/11/planning-des-tours-deau-du-11-au-17-mai-2026/";
const CURRENT_MANUAL_TITLE = "Planning officiel SMGEAG du 11 au 17 mai 2026";

const CURRENT_WEEK_GROUPS: ManualGroup[] = [
  { communeSlugs: ["capesterre-belle-eau"], sector: "Capesterre Belle-Eau 1", dates: ["2026-05-12", "2026-05-14", "2026-05-16"], start: "20:00", end: "11:00" },
  { communeSlugs: ["capesterre-belle-eau", "terre-de-haut", "terre-de-bas", "trois-rivieres"], sector: "CBE 2 & 3 / Les Saintes / Trois-Rivieres", dates: ["2026-05-12", "2026-05-14", "2026-05-16"], start: "20:00", end: "07:00" },
  { communeSlugs: ["capesterre-belle-eau"], sector: "Capesterre Belle-Eau 4", dates: ["2026-05-12", "2026-05-14", "2026-05-16"], start: "20:00", end: "07:00" },
  { communeSlugs: ["goyave"], sector: "Goyave", dates: ["2026-05-12", "2026-05-16"], start: "20:00", end: "07:00" },
  { communeSlugs: ["les-abymes"], sector: "Abymes 1, 2 & 3", dates: ["2026-05-12", "2026-05-14", "2026-05-16"], start: "20:00", end: "07:00" },
  { communeSlugs: ["le-gosier"], sector: "Gosier 1 & 2", dates: ["2026-05-12", "2026-05-14", "2026-05-16"], start: "20:00", end: "07:00" },
  { communeSlugs: ["pointe-a-pitre", "les-abymes"], sector: "Pointe-a-Pitre / Abymes 1", dates: ["2026-05-12", "2026-05-16"], start: "20:00", end: "07:00" },
  { communeSlugs: ["pointe-a-pitre", "les-abymes"], sector: "Pointe-a-Pitre / Abymes 2", dates: ["2026-05-14"], start: "20:00", end: "07:00" },
  { communeSlugs: ["saint-francois"], sector: "Saint-Francois", dates: ["2026-05-11", "2026-05-13", "2026-05-15", "2026-05-17"], start: "20:00", end: "06:00" },
  { communeSlugs: ["sainte-anne"], sector: "Sainte-Anne 3", dates: ["2026-05-11", "2026-05-13", "2026-05-15", "2026-05-17"], start: "20:00", end: "06:00" },
  { communeSlugs: ["morne-a-l-eau"], sector: "Morne-a-l'Eau 1", dates: ["2026-05-11", "2026-05-13"], start: "20:00", end: "05:00" },
  { communeSlugs: ["morne-a-l-eau"], sector: "Morne-a-l'Eau 1", dates: ["2026-05-15"], start: "20:00", end: "09:00" },
  { communeSlugs: ["morne-a-l-eau"], sector: "Morne-a-l'Eau 2", dates: ["2026-05-12", "2026-05-14"], start: "20:00", end: "05:00" },
  { communeSlugs: ["le-moule"], sector: "Le Moule", dates: ["2026-05-11", "2026-05-13"], start: "20:00", end: "05:00" },
  { communeSlugs: ["le-moule"], sector: "Le Moule", dates: ["2026-05-15"], start: "20:00", end: "09:00" },
  { communeSlugs: ["trois-rivieres"], sector: "Trois-Rivieres 5", dates: ["2026-05-12", "2026-05-14", "2026-05-16"], start: "18:00", end: "08:00" },
  { communeSlugs: ["trois-rivieres"], sector: "Trois-Rivieres 6", dates: ["2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15", "2026-05-16", "2026-05-17"], start: "18:00", end: "07:00" },
  { communeSlugs: ["gourbeyre"], sector: "Gourbeyre", dates: ["2026-05-11", "2026-05-13", "2026-05-15"], start: "17:00", end: "07:00" },
  { communeSlugs: ["sainte-rose"], sector: "Sainte-Rose 1", dates: ["2026-05-12", "2026-05-16"], start: "17:00", end: "09:00" },
  { communeSlugs: ["sainte-rose"], sector: "Sainte-Rose 2", dates: ["2026-05-12"], start: "19:00", end: "08:00" },
];

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return `manual_smg_${(h >>> 0).toString(36)}`;
}

function addOneDay(d: Date) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + 1);
  return copy;
}

function todayGuadeloupeKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guadeloupe",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

async function seedCurrentSmgeagWeek() {
  const { data: communes, error } = await supabaseAdmin.from("communes").select("id, slug");
  if (error) throw error;
  const bySlug = new Map((communes ?? []).map((commune) => [commune.slug, commune.id]));

  const nowMs = Date.now();
  const today = todayGuadeloupeKey();
  let historyInserted = 0;
  let historyUpdated = 0;
  let outagesInserted = 0;
  let outagesUpdated = 0;
  let forecastsUpserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const group of CURRENT_WEEK_GROUPS) {
    for (const communeSlug of group.communeSlugs) {
      const communeId = bySlug.get(communeSlug);
      if (!communeId) {
        skipped++;
        continue;
      }
      for (const date of group.dates) {
        const startsAt = guadeloupeDateTimeToUtc(date, group.start);
        let endsAt = guadeloupeDateTimeToUtc(date, group.end);
        if (!startsAt || !endsAt) {
          skipped++;
          continue;
        }
        if (endsAt.getTime() <= startsAt.getTime()) endsAt = addOneDay(endsAt);

        const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));
        const externalId = hashId(`${CURRENT_MANUAL_SOURCE_URL}|${communeSlug}|${group.sector}|${date}|${group.start}|${group.end}`);
        const description = `Tour d'eau SMGEAG : fermeture ${group.start}, ouverture ${group.end}`;

        if (endsAt.getTime() < nowMs) {
          const row = {
            commune_id: communeId,
            source: "official" as const,
            source_url: CURRENT_MANUAL_SOURCE_URL,
            external_id: externalId,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            duration_minutes: durationMinutes,
            description,
            cause: "tour d'eau",
            sector: group.sector,
            reliability_score: 0.98,
            confidence_score: 0.95,
            time_precision: "exact" as const,
          };

          const existing = await supabaseAdmin.from("outage_history").select("id").eq("external_id", externalId).maybeSingle();
          const result = existing.data
            ? await supabaseAdmin.from("outage_history").update(row).eq("id", existing.data.id)
            : await supabaseAdmin.from("outage_history").insert(row);
          if (result.error) errors++;
          else if (existing.data) historyUpdated++;
          else historyInserted++;
        } else {
          const row = {
            commune_id: communeId,
            source: "official" as const,
            source_url: CURRENT_MANUAL_SOURCE_URL,
            external_id: externalId,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            estimated_duration_minutes: durationMinutes,
            description,
            cause: "tour d'eau",
            sector: group.sector,
            reliability_score: 0.98,
            confidence_score: 0.95,
            confidence_source_weight: 1.0,
            is_estimated: false,
            time_precision: "exact" as const,
            status: (startsAt.getTime() <= nowMs && endsAt.getTime() >= nowMs ? "ongoing" : "scheduled") as "ongoing" | "scheduled",
          };

          const existing = await supabaseAdmin.from("outages").select("id").eq("external_id", externalId).maybeSingle();
          const result = existing.data
            ? await supabaseAdmin.from("outages").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.data.id)
            : await supabaseAdmin.from("outages").insert(row);
          if (result.error) errors++;
          else if (existing.data) outagesUpdated++;
          else outagesInserted++;
        }

        if (date >= today) {
          const forecast = await supabaseAdmin.from("forecasts").upsert({
            commune_id: communeId,
            forecast_date: date,
            window_start: `${group.start}:00`,
            window_end: `${group.end}:00`,
            expected_duration_minutes: durationMinutes,
            probability: 0.98,
            confidence: 0.96,
            trend: "stable",
            basis: `${CURRENT_MANUAL_TITLE} · import manuel officiel`,
            sample_size: 1,
            day_of_week_signal: 0,
          }, { onConflict: "commune_id,forecast_date,window_start" });
          if (forecast.error) errors++;
          else forecastsUpserted++;
        }
      }
    }
  }

  await supabaseAdmin.from("scraper_runs").insert({
    source: "smgeag-planning-manual-seed",
    url: CURRENT_MANUAL_SOURCE_URL,
    ok: errors === 0,
    items_found: historyInserted + historyUpdated + outagesInserted + outagesUpdated,
    items_inserted: historyInserted + outagesInserted + forecastsUpserted,
    items_updated: historyUpdated + outagesUpdated,
    notes: `manual week seed ${CURRENT_MANUAL_TITLE} history=${historyInserted}/${historyUpdated} outages=${outagesInserted}/${outagesUpdated} forecasts=${forecastsUpserted} skipped=${skipped} errors=${errors}`,
  });

  return {
    ok: errors === 0,
    source_url: CURRENT_MANUAL_SOURCE_URL,
    history_inserted: historyInserted,
    history_updated: historyUpdated,
    outages_inserted: outagesInserted,
    outages_updated: outagesUpdated,
    forecasts_upserted: forecastsUpserted,
    skipped,
    errors,
  };
}

export const Route = createFileRoute("/api/public/jobs/backfill-planning")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) =>
        runProtectedJob(request, async () => {
          const body = (await request.json().catch(() => ({}))) as BackfillBody;
          const aiBackfill = await backfillPlanningHistory({ since: body.since, maxPosts: body.maxPosts });

          if (aiBackfill.ok || aiBackfill.items_extracted > 0) return aiBackfill;

          const manualSeed = await seedCurrentSmgeagWeek();
          return {
            ...aiBackfill,
            ok: manualSeed.ok,
            manual_seed_applied: true,
            manual_seed: manualSeed,
          };
        }),
    },
  },
});
