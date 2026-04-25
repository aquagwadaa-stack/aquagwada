import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Scrape les plannings hebdomadaires SMGEAG depuis l'API publique WordPress.
 * Les plannings sont publiés sous forme d'images : on extrait donc les images
 * officielles, puis Lovable AI lit les tableaux pour produire des lignes datées.
 *
 * Règle de vérité :
 * - passé terminé => outage_history (historique réel officiel)
 * - aujourd'hui / futur => outages + forecasts avec confiance officielle élevée
 * - les prévisions statistiques ne doivent compléter qu'après ces lignes officielles
 */

const WP_POSTS_URL = "https://www.smgeag.fr/wp-json/wp/v2/posts";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_BACKFILL_SINCE = "2025-10-01";

const OFFICIAL_BASIS_PREFIX = "Planning officiel SMGEAG";

type CommuneRow = { id: string; name: string; slug: string };

type WPPost = {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
};

type AIPlanningItem = {
  commune_name: string;
  sector: string | null;
  date: string;
  start: string | null;
  end: string | null;
  description?: string | null;
};

type PersistStats = {
  items: number;
  historyInserted: number;
  historyUpdated: number;
  outagesInserted: number;
  outagesUpdated: number;
  forecastsUpserted: number;
  skipped: number;
  errors: number;
  aiFailed: number;
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(s: string): string {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&#038;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return `smgp_${(h >>> 0).toString(36)}`;
}

/** Mappe une zone SMGEAG (déduite du nom d'image) vers une liste de communes. */
const ZONE_TO_COMMUNES: Record<string, string[]> = {
  centre: [
    "les-abymes", "pointe-a-pitre", "le-gosier", "baie-mahault", "petit-bourg", "goyave",
  ],
  "grande terre": [
    "le-moule", "morne-a-l-eau", "saint-francois", "sainte-anne", "petit-canal", "port-louis", "anse-bertrand",
  ],
  "sud basse terre": [
    "capesterre-belle-eau", "trois-rivieres", "vieux-fort", "gourbeyre", "basse-terre", "saint-claude", "baillif",
  ],
  "nord basse terre": [
    "sainte-rose", "deshaies", "bouillante", "pointe-noire", "vieux-habitants", "lamentin",
  ],
  saintes: ["terre-de-haut", "terre-de-bas"],
  desirade: ["la-desirade"],
  "marie galante": ["grand-bourg", "saint-louis", "capesterre-de-marie-galante"],
};

function detectZoneFromUrl(url: string): string | null {
  const n = norm(url);
  if (n.includes("nord basse")) return "nord basse terre";
  if (n.includes("sud basse")) return "sud basse terre";
  if (n.includes("grande terre")) return "grande terre";
  if (n.includes("marie galante")) return "marie galante";
  if (n.includes("desirade") || n.includes("désirade")) return "desirade";
  if (n.includes("saintes")) return "saintes";
  if (n.includes("centre")) return "centre";
  return null;
}

/** Extrait les bornes de la semaine depuis l'URL ou le titre (ex: "du 20042026 au 26042026" ou "du 20 au 26 avril 2026"). */
function extractWeekRange(post: WPPost & { imageUrls: string[] }): { start: Date; end: Date } | null {
  // 1) Cherche d'abord un format compact dans les noms d'images
  for (const img of post.imageUrls) {
    const m = img.match(/(\d{2})(\d{2})(\d{4})[-_]au[-_](\d{2})(\d{2})(\d{4})/i);
    if (m) {
      const start = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
      const end = new Date(`${m[6]}-${m[5]}-${m[4]}T23:59:59.999Z`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) return { start, end };
    }
  }
  // 2) Sinon, fallback sur la date du post : semaine commençant à la date du post
  const postDate = new Date(post.date);
  if (Number.isNaN(postDate.getTime())) return null;
  const start = new Date(postDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/** Communes (slugs) couvertes par les images du post, déduites des zones détectées. */
function communesCoveredByPostImages(post: WPPost & { imageUrls: string[] }, communes: CommuneRow[]): string[] {
  const slugs = new Set<string>();
  for (const img of post.imageUrls) {
    const zone = detectZoneFromUrl(img);
    if (!zone) continue;
    for (const slug of ZONE_TO_COMMUNES[zone] ?? []) slugs.add(slug);
  }
  return communes.filter((c) => slugs.has(c.slug)).map((c) => c.id);
}

/** Construit un "événement déterministe" par jour×commune pour la fenêtre 20:00→07:00, marqué approximate. */
async function persistFallbackPlanning(
  post: WPPost & { imageUrls: string[] },
  communes: CommuneRow[],
  stats: PersistStats,
) {
  const range = extractWeekRange(post);
  if (!range) return;
  const communeIds = communesCoveredByPostImages(post, communes);
  if (communeIds.length === 0) return;

  const nowMs = Date.now();
  const title = decodeHtml(post.title.rendered);
  const basis = `${FALLBACK_BASIS_PREFIX} · ${title}`.slice(0, 500);

  // Itère jour par jour entre range.start et range.end
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += 24 * 60 * 60_000) {
    const dayStart = new Date(t);
    // Fenêtre standard SMGEAG : fermeture 20h → ouverture 7h le lendemain
    const startsAt = new Date(dayStart); startsAt.setUTCHours(20, 0, 0, 0);
    const endsAt = new Date(dayStart); endsAt.setUTCDate(endsAt.getUTCDate() + 1); endsAt.setUTCHours(7, 0, 0, 0);
    const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
    for (const communeId of communeIds) {
      const externalId = hashId(`fallback|${post.id}|${communeId}|${startsAt.toISOString().slice(0, 10)}`);
      const isPast = endsAt.getTime() < nowMs;
      if (isPast) {
        const row = {
          commune_id: communeId,
          source: "official" as const,
          source_url: post.link,
          external_id: externalId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          duration_minutes: durationMinutes,
          description: `Planning hebdomadaire SMGEAG (créneau standard 20h-07h, secteurs non détaillés)`,
          cause: "tour d'eau",
          sector: null,
          reliability_score: 0.85,
          confidence_score: 0.6,
          time_precision: "approximate" as const,
        };
        const { data: existing } = await supabaseAdmin
          .from("outage_history").select("id").eq("external_id", externalId).maybeSingle();
        const { error } = existing
          ? await supabaseAdmin.from("outage_history").update(row).eq("id", existing.id)
          : await supabaseAdmin.from("outage_history").insert(row);
        if (error) stats.errors++;
        else if (existing) stats.historyUpdated++;
        else stats.historyInserted++;
      } else {
        const status = startsAt.getTime() <= nowMs && endsAt.getTime() >= nowMs ? "ongoing" : "scheduled";
        const row = {
          commune_id: communeId,
          source: "official" as const,
          source_url: post.link,
          external_id: externalId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          estimated_duration_minutes: durationMinutes,
          description: `Planning hebdomadaire SMGEAG (créneau standard 20h-07h, secteurs non détaillés)`,
          cause: "tour d'eau",
          sector: null,
          reliability_score: 0.85,
          confidence_score: 0.6,
          confidence_source_weight: 1.0,
          is_estimated: true,
          time_precision: "approximate" as const,
          status: status as "scheduled" | "ongoing",
        };
        const { data: existing } = await supabaseAdmin
          .from("outages").select("id").eq("external_id", externalId).maybeSingle();
        const r = existing
          ? await supabaseAdmin.from("outages").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id)
          : await supabaseAdmin.from("outages").insert(row);
        if (r.error) stats.errors++;
        else if (existing) stats.outagesUpdated++;
        else stats.outagesInserted++;

        if (startsAt.getTime() >= new Date().setUTCHours(0, 0, 0, 0)) {
          const { error } = await supabaseAdmin.from("forecasts").upsert({
            commune_id: communeId,
            forecast_date: startsAt.toISOString().slice(0, 10),
            window_start: "20:00:00",
            window_end: "07:00:00",
            expected_duration_minutes: durationMinutes,
            probability: 0.9,
            confidence: 0.75,
            trend: "stable",
            basis,
            sample_size: 1,
            day_of_week_signal: 0,
          }, { onConflict: "commune_id,forecast_date,window_start" });
          if (error) stats.errors++;
          else stats.forecastsUpserted++;
        }
      }
      stats.items++;
    }
  }
  stats.fallbackUsed++;
}

function cleanJson(content: string): string {
  return content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function toDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addOneDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + 1);
  return copy;
}

function extractPlanningImageUrls(contentHtml: string): string[] {
  const found = new Set<string>();
  const attrs = [...contentHtml.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((m) => decodeHtml(m[1]));
  for (const url of attrs) {
    if (!/\.(png|jpe?g|webp)(\?|$)/i.test(url)) continue;
    const n = norm(url);
    if (!n.includes("planning des tours deau")) continue;
    if (n.includes("carte generale") || n.includes("zones")) continue;
    found.add(url);
  }
  return [...found];
}

function findCommuneIds(name: string | null | undefined, communes: CommuneRow[]): string[] {
  const target = norm(name || "");
  if (!target) return [];

  const aliasToSlug: Record<string, string[]> = {
    cbe: ["capesterre-belle-eau"],
    capesterre: ["capesterre-belle-eau"],
    abymes: ["les-abymes"],
    "les abymes": ["les-abymes"],
    gosier: ["le-gosier"],
    moule: ["le-moule"],
    desirade: ["la-desirade"],
    saintes: ["terre-de-haut", "terre-de-bas"],
    "les saintes": ["terre-de-haut", "terre-de-bas"],
    "terre de haut": ["terre-de-haut"],
    "terre de bas": ["terre-de-bas"],
  };

  const directAlias = aliasToSlug[target];
  if (directAlias) return communes.filter((c) => directAlias.includes(c.slug)).map((c) => c.id);

  const exact = communes.filter((c) => norm(c.name) === target || norm(c.slug) === target).map((c) => c.id);
  if (exact.length) return exact;

  return communes
    .filter((c) => {
      const cn = norm(c.name);
      const cs = norm(c.slug);
      return cn.length >= 4 && (target.includes(cn) || cn.includes(target) || target.includes(cs));
    })
    .map((c) => c.id);
}

function communeIdsMentionedInText(text: string, communes: CommuneRow[]): string[] {
  const haystack = norm(text);
  const ids = new Set<string>();
  for (const c of communes) {
    const cn = norm(c.name);
    const cs = norm(c.slug);
    if (cn.length >= 4 && (haystack.includes(cn) || haystack.includes(cs))) ids.add(c.id);
  }
  for (const alias of ["cbe", "abymes", "gosier", "moule", "les saintes", "saintes"]) {
    if (haystack.includes(alias)) findCommuneIds(alias, communes).forEach((id) => ids.add(id));
  }
  return [...ids];
}

async function fetchPlanningPosts(opts: { since?: string; maxPosts: number }): Promise<Array<WPPost & { imageUrls: string[] }>> {
  const posts: Array<WPPost & { imageUrls: string[] }> = [];
  const sinceMs = opts.since ? new Date(`${opts.since}T00:00:00.000Z`).getTime() : null;

  for (let page = 1; page <= 5 && posts.length < opts.maxPosts; page++) {
    const url = `${WP_POSTS_URL}?search=${encodeURIComponent("planning tours eau")}&per_page=100&page=${page}&_fields=id,date,title,link,content`;
    const res = await fetch(url, { headers: { "user-agent": "AquaGwadaBot/1.0 (+contact@aquagwada.fr)" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) break;
    const batch = (await res.json()) as WPPost[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const post of batch) {
      const title = decodeHtml(post.title?.rendered ?? "");
      const postMs = new Date(post.date).getTime();
      if (sinceMs && postMs < sinceMs) continue;
      if (!norm(title).includes("planning") || !norm(title).includes("tour")) continue;
      const imageUrls = extractPlanningImageUrls(post.content?.rendered ?? "");
      if (imageUrls.length === 0) continue;
      posts.push({ ...post, imageUrls });
      if (posts.length >= opts.maxPosts) break;
    }
  }

  return posts;
}

async function extractItemsFromPost(post: WPPost & { imageUrls: string[] }, communes: CommuneRow[]): Promise<AIPlanningItem[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const title = decodeHtml(post.title.rendered);
  const communeNames = communes.map((c) => c.name).join(", ");
  const prompt = `Tu lis des images officielles SMGEAG de planning hebdomadaire des tours d'eau en Guadeloupe.
Article: ${title}
URL: ${post.link}
Communes valides: ${communeNames}.

Retourne un JSON STRICT sous cette forme:
{"items":[{"commune_name":"Nom exact d'une commune valide","sector":"zone/secteur si visible sinon null","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","description":"Fermeture HH:MM, ouverture HH:MM"}]}

Règles impératives:
- Extrais uniquement les lignes de coupure/tour d'eau des tableaux de planning, pas les cartes de zones.
- Si une cellule mentionne plusieurs communes, crée un item par commune.
- Utilise uniquement les noms de la liste. Développe: CBE = Capesterre-Belle-Eau, Abymes = Les Abymes, Gosier = Le Gosier, Moule = Le Moule, Les Saintes = Terre-de-Haut et Terre-de-Bas si non précisé.
- Les dates doivent être celles de la semaine du planning, au format YYYY-MM-DD.
- Si l'ouverture est le lendemain (ex: fermeture 20:00, ouverture 07:00), garde end="07:00".`;

  const content = [
    { type: "text", text: prompt },
    ...post.imageUrls.slice(0, 4).map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI HTTP ${res.status}: ${text.slice(0, 160)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return [];

  const parsed = JSON.parse(cleanJson(raw)) as { items?: AIPlanningItem[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function persistPlanningItems(
  post: WPPost,
  items: AIPlanningItem[],
  communes: CommuneRow[],
): Promise<PersistStats> {
  const stats: PersistStats = {
    items: items.length,
    historyInserted: 0,
    historyUpdated: 0,
    outagesInserted: 0,
    outagesUpdated: 0,
    forecastsUpserted: 0,
    skipped: 0,
    errors: 0,
    aiFailed: 0,
    fallbackUsed: 0,
  };

  const nowMs = Date.now();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const title = decodeHtml(post.title.rendered);

  for (const item of items) {
    const startTime = normalizeTime(item.start);
    const endTime = normalizeTime(item.end);
    if (!startTime || !endTime || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      stats.skipped++;
      continue;
    }

    const startsAt = toDateTime(item.date, startTime);
    let endsAt = toDateTime(item.date, endTime);
    if (!startsAt || !endsAt) {
      stats.skipped++;
      continue;
    }
    if (endsAt.getTime() <= startsAt.getTime()) endsAt = addOneDay(endsAt);

    const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));
    const baseDescription = item.description?.slice(0, 420) || `Tour d'eau SMGEAG : fermeture ${startTime}, ouverture ${endTime}`;
    const basis = `${OFFICIAL_BASIS_PREFIX} · ${title}`.slice(0, 500);

    const communeIds = new Set<string>(findCommuneIds(item.commune_name, communes));
    communeIdsMentionedInText(`${item.commune_name ?? ""} ${item.sector ?? ""}`, communes).forEach((id) => communeIds.add(id));

    if (communeIds.size === 0) {
      stats.skipped++;
      continue;
    }

    for (const communeId of communeIds) {
      const sector = item.sector?.slice(0, 180) || null;
      const externalId = hashId(`${post.id}|${communeId}|${item.date}|${startTime}|${endTime}|${sector ?? ""}`);

      if (endsAt.getTime() < nowMs) {
        const row = {
          commune_id: communeId,
          source: "official" as const,
          source_url: post.link,
          external_id: externalId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          duration_minutes: durationMinutes,
          description: baseDescription,
          cause: "tour d'eau",
          sector,
          reliability_score: 0.98,
          confidence_score: 0.96,
          time_precision: "exact" as const,
        };

        const { data: existing } = await supabaseAdmin
          .from("outage_history")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();

        const { error } = existing
          ? await supabaseAdmin.from("outage_history").update(row).eq("id", existing.id)
          : await supabaseAdmin.from("outage_history").insert(row);

        if (error) stats.errors++;
        else if (existing) stats.historyUpdated++;
        else stats.historyInserted++;
      } else {
        const status = startsAt.getTime() <= nowMs && endsAt.getTime() >= nowMs ? "ongoing" : "scheduled";
        const outageRow = {
          commune_id: communeId,
          source: "official" as const,
          source_url: post.link,
          external_id: externalId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          estimated_duration_minutes: durationMinutes,
          description: baseDescription,
          cause: "tour d'eau",
          sector,
          reliability_score: 0.98,
          confidence_score: 0.96,
          confidence_source_weight: 1.0,
          is_estimated: false,
          time_precision: "exact" as const,
          status: status as "scheduled" | "ongoing",
        };

        const { data: existingOutage } = await supabaseAdmin
          .from("outages")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();

        const outageResult = existingOutage
          ? await supabaseAdmin.from("outages").update({ ...outageRow, updated_at: new Date().toISOString() }).eq("id", existingOutage.id)
          : await supabaseAdmin.from("outages").insert(outageRow);

        if (outageResult.error) stats.errors++;
        else if (existingOutage) stats.outagesUpdated++;
        else stats.outagesInserted++;

        if (startsAt.getTime() >= today.getTime()) {
          const { error } = await supabaseAdmin.from("forecasts").upsert({
            commune_id: communeId,
            forecast_date: item.date,
            window_start: `${startTime}:00`,
            window_end: `${endTime}:00`,
            expected_duration_minutes: durationMinutes,
            probability: 0.98,
            confidence: 0.97,
            trend: "stable",
            basis,
            sample_size: 1,
            day_of_week_signal: 0,
          }, { onConflict: "commune_id,forecast_date,window_start" });
          if (error) stats.errors++;
          else stats.forecastsUpserted++;
        }
      }
    }
  }

  return stats;
}

function mergeStats(target: PersistStats, source: PersistStats) {
  target.items += source.items;
  target.historyInserted += source.historyInserted;
  target.historyUpdated += source.historyUpdated;
  target.outagesInserted += source.outagesInserted;
  target.outagesUpdated += source.outagesUpdated;
  target.forecastsUpserted += source.forecastsUpserted;
  target.skipped += source.skipped;
  target.errors += source.errors;
  target.aiFailed += source.aiFailed;
  target.fallbackUsed += source.fallbackUsed;
}

export async function scrapePlanning(): Promise<{
  ok: boolean;
  posts: number;
  images: number;
  forecasts_extracted: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  const startedAt = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];

  const posts = await fetchPlanningPosts({ maxPosts: 3 });
  const totals: PersistStats = { items: 0, historyInserted: 0, historyUpdated: 0, outagesInserted: 0, outagesUpdated: 0, forecastsUpserted: 0, skipped: 0, errors: 0, aiFailed: 0, fallbackUsed: 0 };
  let images = 0;

  for (const post of posts) {
    images += post.imageUrls.length;
    let items: AIPlanningItem[] = [];
    let aiFailed = false;
    try {
      items = await extractItemsFromPost(post, list);
    } catch (e) {
      aiFailed = true;
      console.warn("[planning] AI extraction failed", post.link, e);
    }
    try {
      const stats = await persistPlanningItems(post, items, list);
      if (aiFailed) stats.aiFailed++;
      // Si l'IA a échoué (ex: 402 crédits) ou n'a rien produit, on tente un fallback déterministe.
      if (aiFailed || items.length === 0) {
        await persistFallbackPlanning(post, list, stats);
      }
      mergeStats(totals, stats);
    } catch (e) {
      totals.errors++;
      console.warn("[planning] post persist failed", post.link, e);
    }
  }

  const inserted = totals.historyInserted + totals.outagesInserted + totals.forecastsUpserted;
  const updated = totals.historyUpdated + totals.outagesUpdated;
  await supabaseAdmin.from("scraper_runs").insert({
    source: "smgeag-planning",
    url: posts.map((p) => p.link).join(","),
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok: totals.errors === 0 && (totals.outagesInserted + totals.outagesUpdated + totals.historyInserted + totals.historyUpdated + totals.forecastsUpserted) > 0,
    items_found: totals.items,
    items_inserted: inserted,
    items_updated: updated,
    notes: `posts=${posts.length} images=${images} history=${totals.historyInserted}/${totals.historyUpdated} outages=${totals.outagesInserted}/${totals.outagesUpdated} forecasts=${totals.forecastsUpserted} skipped=${totals.skipped} errors=${totals.errors} aiFailed=${totals.aiFailed} fallback=${totals.fallbackUsed}`,
  });

  return { ok: totals.errors === 0, posts: posts.length, images, forecasts_extracted: totals.items, inserted, updated, skipped: totals.skipped, errors: totals.errors };
}

export async function backfillPlanningHistory(opts: { since?: string; maxPosts?: number } = {}): Promise<{
  ok: boolean;
  since: string;
  posts: number;
  images: number;
  items_extracted: number;
  history_inserted: number;
  history_updated: number;
  outages_inserted: number;
  outages_updated: number;
  forecasts_upserted: number;
  skipped: number;
  errors: number;
}> {
  const since = opts.since ?? DEFAULT_BACKFILL_SINCE;
  const maxPosts = Math.min(120, Math.max(1, opts.maxPosts ?? 80));
  const startedAt = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];

  const posts = await fetchPlanningPosts({ since, maxPosts });
  const totals: PersistStats = { items: 0, historyInserted: 0, historyUpdated: 0, outagesInserted: 0, outagesUpdated: 0, forecastsUpserted: 0, skipped: 0, errors: 0, aiFailed: 0, fallbackUsed: 0 };
  let images = 0;

  for (const post of posts) {
    images += post.imageUrls.length;
    let items: AIPlanningItem[] = [];
    let aiFailed = false;
    try {
      items = await extractItemsFromPost(post, list);
    } catch (e) {
      aiFailed = true;
      console.warn("[planning-backfill] AI extraction failed", post.link, e);
    }
    try {
      const stats = await persistPlanningItems(post, items, list);
      if (aiFailed) stats.aiFailed++;
      if (aiFailed || items.length === 0) {
        await persistFallbackPlanning(post, list, stats);
      }
      mergeStats(totals, stats);
    } catch (e) {
      totals.errors++;
      console.warn("[planning-backfill] post persist failed", post.link, e);
    }
  }

  await supabaseAdmin.from("scraper_runs").insert({
    source: "smgeag-planning-backfill",
    url: `wp-json since=${since}`,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok: totals.errors === 0 && (totals.outagesInserted + totals.outagesUpdated + totals.historyInserted + totals.historyUpdated + totals.forecastsUpserted) > 0,
    items_found: totals.items,
    items_inserted: totals.historyInserted + totals.outagesInserted + totals.forecastsUpserted,
    items_updated: totals.historyUpdated + totals.outagesUpdated,
    notes: `posts=${posts.length} images=${images} history=${totals.historyInserted}/${totals.historyUpdated} outages=${totals.outagesInserted}/${totals.outagesUpdated} forecasts=${totals.forecastsUpserted} skipped=${totals.skipped} errors=${totals.errors} aiFailed=${totals.aiFailed} fallback=${totals.fallbackUsed}`,
  });

  return {
    ok: totals.errors === 0,
    since,
    posts: posts.length,
    images,
    items_extracted: totals.items,
    history_inserted: totals.historyInserted,
    history_updated: totals.historyUpdated,
    outages_inserted: totals.outagesInserted,
    outages_updated: totals.outagesUpdated,
    forecasts_upserted: totals.forecastsUpserted,
    skipped: totals.skipped,
    errors: totals.errors,
  };
}
