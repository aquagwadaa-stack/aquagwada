import { CONTACT_EMAIL } from "@/lib/contact";
import { guadeloupeDateTimeToUtc } from "@/lib/timezone";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Scrape les plannings hebdomadaires SMGEAG depuis l'API publique WordPress.
 * Les plannings sont publies sous forme d'images : on extrait les images
 * officielles, puis Lovable AI lit chaque image pour produire des lignes datees.
 *
 * Regle de verite :
 * - passe termine => outage_history (historique reel officiel)
 * - aujourd'hui / futur => outages + forecasts avec confiance officielle elevee
 * - les previsions statistiques ne completent qu'apres ces lignes officielles
 */

const WP_POSTS_URL = "https://www.smgeag.fr/wp-json/wp/v2/posts";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_BACKFILL_SINCE = "2025-10-01";
const OFFICIAL_BASIS_PREFIX = "Planning officiel SMGEAG";
const DEFAULT_MIN_IMPORTED_ROWS = 12;

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
};

type ExtractionResult = {
  items: AIPlanningItem[];
  images: number;
  imagesFailed: number;
  modelsUsed: string[];
  errors: string[];
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(s: string): string {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
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

const ZONE_TO_COMMUNES: Record<string, string[]> = {
  centre: ["les-abymes", "pointe-a-pitre", "le-gosier", "baie-mahault", "petit-bourg", "goyave"],
  "grande terre": ["le-moule", "morne-a-l-eau", "saint-francois", "sainte-anne", "petit-canal", "port-louis", "anse-bertrand"],
  "sud basse terre": ["capesterre-belle-eau", "trois-rivieres", "vieux-fort", "gourbeyre", "basse-terre", "saint-claude", "baillif"],
  "nord basse terre": ["sainte-rose", "deshaies", "bouillante", "pointe-noire", "vieux-habitants", "lamentin"],
  saintes: ["terre-de-haut", "terre-de-bas"],
  desirade: ["la-desirade"],
  "marie galante": ["grand-bourg", "saint-louis", "capesterre-de-marie-galante"],
};

function detectZoneFromUrl(url: string): string | null {
  const n = norm(url);
  if (n.includes("nord basse")) return "nord basse terre";
  if (n.includes("sud basse")) return "sud basse terre";
  if (n.includes("basse terre")) return "sud basse terre";
  if (n.includes("grande terre")) return "grande terre";
  if (n.includes("marie galante")) return "marie galante";
  if (n.includes("desirade")) return "desirade";
  if (n.includes("saintes")) return "saintes";
  if (n.includes("centre")) return "centre";
  return null;
}

function cleanJson(content: string): string {
  const stripped = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first >= 0 && last > first) return stripped.slice(first, last + 1);
  return stripped;
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

function addOneDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + 1);
  return copy;
}

function guadeloupeDateKey(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guadeloupe",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
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
    "morne a l eau": ["morne-a-l-eau"],
    "pointe a pitre": ["pointe-a-pitre"],
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
  for (const alias of ["cbe", "abymes", "gosier", "moule", "les saintes", "saintes", "morne a l eau", "pointe a pitre"]) {
    if (haystack.includes(alias)) findCommuneIds(alias, communes).forEach((id) => ids.add(id));
  }
  return [...ids];
}

async function fetchPlanningPosts(opts: { since?: string; maxPosts: number }): Promise<Array<WPPost & { imageUrls: string[] }>> {
  const posts: Array<WPPost & { imageUrls: string[] }> = [];
  const sinceMs = opts.since ? new Date(`${opts.since}T00:00:00.000Z`).getTime() : null;

  for (let page = 1; page <= 5 && posts.length < opts.maxPosts; page++) {
    const url = `${WP_POSTS_URL}?search=${encodeURIComponent("planning tours eau")}&per_page=100&page=${page}&_fields=id,date,title,link,content`;
    const res = await fetch(url, {
      headers: { "user-agent": `AquaGwadaBot/1.0 (+mailto:${CONTACT_EMAIL})` },
      signal: AbortSignal.timeout(30_000),
    });
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

function planningAiModels(): string[] {
  const configured = process.env.PLANNING_AI_MODELS || process.env.PLANNING_AI_MODEL || "";
  const models = configured.split(",").map((m) => m.trim()).filter(Boolean);
  if (models.length) return models;

  // Flash keeps the weekly cron affordable; Pro is only a fallback when Flash
  // fails or returns an unusable empty JSON for a planning image.
  return ["google/gemini-2.5-flash", "google/gemini-2.5-pro"];
}

function buildPrompt(post: WPPost, imageUrl: string, communes: CommuneRow[]): string {
  const title = decodeHtml(post.title.rendered);
  const zone = detectZoneFromUrl(imageUrl);
  const validCommunes = communes.map((c) => c.name).join(", ");
  const zoneHint = zone ? `Zone probable de cette image: ${zone}. Communes attendues possibles: ${(ZONE_TO_COMMUNES[zone] ?? []).join(", ")}.` : "Zone non detectee depuis l'URL.";

  return `Tu lis UNE SEULE image officielle SMGEAG du planning hebdomadaire des tours d'eau en Guadeloupe.
Article: ${title}
URL article: ${post.link}
URL image: ${imageUrl}
${zoneHint}
Communes valides: ${validCommunes}.

Objectif: extraire tous les blocs visibles de CETTE image uniquement. Un bloc contient generalement un nom de commune/zone, une liste de quartiers/secteurs, puis une ligne de jours et horaires, par exemple "Lundi / mercredi / vendredi / dimanche de 20h a 7h".

Retourne un JSON STRICT, sans markdown, sous cette forme:
{"items":[{"commune_name":"Nom exact d'une commune valide","sector":"intitule du bloc ou secteur, sinon null","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","description":"Fermeture HH:MM, ouverture HH:MM"}]}

Regles imperatives:
- Genere UN item PAR JOUR planifie de la semaine indiquee dans le titre.
- Si un bloc dit "Tous les jours de Xh a Yh", genere 7 items.
- Si fermeture 20:00 et ouverture 07:00, garde end="07:00"; le systeme gere le lendemain.
- Utilise uniquement les noms de "Communes valides".
- Mappings: CBE/Capesterre B/E = Capesterre-Belle-Eau; Abymes = Les Abymes; Gosier = Le Gosier; Moule = Le Moule; Morne-a-l'Eau = Morne-a-l'Eau; Pointe-a-Pitre = Pointe-a-Pitre; Les Saintes = Terre-de-Haut ET Terre-de-Bas.
- Si un bloc lie plusieurs communes, cree un item par commune.
- N'invente jamais de commune, date ou horaire non visible.
- Ne retourne pas de commentaire, uniquement le JSON.`;
}

async function callAiForImage(model: string, prompt: string, imageUrl: string): Promise<AIPlanningItem[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI ${model} HTTP ${res.status}: ${text.slice(0, 220)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`AI ${model} empty response`);

  const parsed = JSON.parse(cleanJson(raw)) as { items?: AIPlanningItem[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function extractItemsFromImage(post: WPPost, imageUrl: string, communes: CommuneRow[]): Promise<{ items: AIPlanningItem[]; model: string; error: string | null }> {
  const prompt = buildPrompt(post, imageUrl, communes);
  let lastError: string | null = null;

  for (const model of planningAiModels()) {
    try {
      const items = await callAiForImage(model, prompt, imageUrl);
      if (items.length > 0) return { items, model, error: null };
      lastError = `AI ${model} returned 0 item`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { items: [], model: planningAiModels().join(" -> "), error: lastError ?? "AI extraction failed" };
}

function dedupeItems(items: AIPlanningItem[]): AIPlanningItem[] {
  const seen = new Set<string>();
  const out: AIPlanningItem[] = [];
  for (const item of items) {
    const key = `${norm(item.commune_name)}|${norm(item.sector ?? "")}|${item.date}|${normalizeTime(item.start)}|${normalizeTime(item.end)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function extractItemsFromPost(post: WPPost & { imageUrls: string[] }, communes: CommuneRow[]): Promise<ExtractionResult> {
  const allItems: AIPlanningItem[] = [];
  const modelsUsed = new Set<string>();
  const errors: string[] = [];
  let imagesFailed = 0;

  for (const imageUrl of post.imageUrls) {
    const result = await extractItemsFromImage(post, imageUrl, communes);
    modelsUsed.add(result.model);
    if (result.error) {
      imagesFailed++;
      errors.push(`${imageUrl}: ${result.error}`.slice(0, 500));
      console.warn("[planning] AI extraction failed", post.link, imageUrl, result.error);
      continue;
    }
    allItems.push(...result.items);
  }

  return {
    items: dedupeItems(allItems),
    images: post.imageUrls.length,
    imagesFailed,
    modelsUsed: [...modelsUsed],
    errors,
  };
}

async function importedRowsForPost(post: WPPost): Promise<number> {
  const [outages, history] = await Promise.all([
    supabaseAdmin.from("outages").select("id", { count: "exact", head: true }).eq("source_url", post.link),
    supabaseAdmin.from("outage_history").select("id", { count: "exact", head: true }).eq("source_url", post.link),
  ]);

  return (outages.count ?? 0) + (history.count ?? 0);
}

function minImportedRows(): number {
  const raw = Number(process.env.PLANNING_MIN_IMPORTED_ROWS ?? DEFAULT_MIN_IMPORTED_ROWS);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_MIN_IMPORTED_ROWS;
}

async function persistPlanningItems(post: WPPost, items: AIPlanningItem[], communes: CommuneRow[]): Promise<PersistStats> {
  const stats: PersistStats = {
    items: items.length,
    historyInserted: 0,
    historyUpdated: 0,
    outagesInserted: 0,
    outagesUpdated: 0,
    forecastsUpserted: 0,
    skipped: 0,
    errors: 0,
  };

  const nowMs = Date.now();
  const todayKey = guadeloupeDateKey();
  const title = decodeHtml(post.title.rendered);

  for (const item of items) {
    const startTime = normalizeTime(item.start);
    const endTime = normalizeTime(item.end);
    if (!startTime || !endTime || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      stats.skipped++;
      continue;
    }

    const startsAt = guadeloupeDateTimeToUtc(item.date, startTime);
    let endsAt = guadeloupeDateTimeToUtc(item.date, endTime);
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

        if (item.date >= todayKey) {
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
}

function writeCount(stats: PersistStats): number {
  return stats.historyInserted + stats.historyUpdated + stats.outagesInserted + stats.outagesUpdated + stats.forecastsUpserted;
}

function summarizeNotes(parts: string[]): string {
  return parts.join(" | ").slice(0, 1800);
}

export async function scrapePlanning(): Promise<{
  ok: boolean;
  posts: number;
  images: number;
  images_failed: number;
  forecasts_extracted: number;
  inserted: number;
  updated: number;
  skipped: number;
  skipped_imported_posts: number;
  errors: number;
}> {
  const startedAt = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];

  const maxPosts = Math.min(3, Math.max(1, Number(process.env.PLANNING_MAX_POSTS ?? 1)));
  const posts = await fetchPlanningPosts({ maxPosts });
  const totals: PersistStats = { items: 0, historyInserted: 0, historyUpdated: 0, outagesInserted: 0, outagesUpdated: 0, forecastsUpserted: 0, skipped: 0, errors: 0 };
  const noteParts: string[] = [];
  let images = 0;
  let imagesFailed = 0;
  let skippedImportedPosts = 0;

  for (const post of posts) {
    const alreadyImported = await importedRowsForPost(post);
    const force = process.env.PLANNING_FORCE_REPROCESS === "true";
    if (!force && alreadyImported >= minImportedRows()) {
      skippedImportedPosts++;
      noteParts.push(`skip ${post.id}: alreadyImported=${alreadyImported}`);
      continue;
    }

    const extracted = await extractItemsFromPost(post, list);
    images += extracted.images;
    imagesFailed += extracted.imagesFailed;
    if (extracted.errors.length) noteParts.push(`post ${post.id} aiErrors=${extracted.errors.slice(0, 2).join(" ; ")}`);
    noteParts.push(`post ${post.id} images=${extracted.images} failed=${extracted.imagesFailed} models=${extracted.modelsUsed.join(",")} items=${extracted.items.length}`);

    try {
      const stats = await persistPlanningItems(post, extracted.items, list);
      mergeStats(totals, stats);
    } catch (e) {
      totals.errors++;
      noteParts.push(`post ${post.id} persist=${e instanceof Error ? e.message : String(e)}`);
      console.warn("[planning] post persist failed", post.link, e);
    }
  }

  const inserted = totals.historyInserted + totals.outagesInserted + totals.forecastsUpserted;
  const updated = totals.historyUpdated + totals.outagesUpdated;
  const wrote = writeCount(totals);
  const ok = totals.errors === 0 && (wrote > 0 || skippedImportedPosts > 0) && imagesFailed < Math.max(1, images);

  await supabaseAdmin.from("scraper_runs").insert({
    source: "smgeag-planning",
    url: posts.map((p) => p.link).join(","),
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok,
    items_found: totals.items,
    items_inserted: inserted,
    items_updated: updated,
    notes: summarizeNotes([
      `posts=${posts.length}`,
      `images=${images}`,
      `imagesFailed=${imagesFailed}`,
      `history=${totals.historyInserted}/${totals.historyUpdated}`,
      `outages=${totals.outagesInserted}/${totals.outagesUpdated}`,
      `forecasts=${totals.forecastsUpserted}`,
      `skipped=${totals.skipped}`,
      `skippedImportedPosts=${skippedImportedPosts}`,
      `errors=${totals.errors}`,
      ...noteParts,
    ]),
  });

  return { ok, posts: posts.length, images, images_failed: imagesFailed, forecasts_extracted: totals.items, inserted, updated, skipped: totals.skipped, skipped_imported_posts: skippedImportedPosts, errors: totals.errors };
}

export async function backfillPlanningHistory(opts: { since?: string; maxPosts?: number } = {}): Promise<{
  ok: boolean;
  since: string;
  posts: number;
  images: number;
  images_failed: number;
  items_extracted: number;
  history_inserted: number;
  history_updated: number;
  outages_inserted: number;
  outages_updated: number;
  forecasts_upserted: number;
  skipped: number;
  skipped_imported_posts: number;
  errors: number;
}> {
  const since = opts.since ?? DEFAULT_BACKFILL_SINCE;
  const maxPosts = Math.min(120, Math.max(1, opts.maxPosts ?? 80));
  const startedAt = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];

  const posts = await fetchPlanningPosts({ since, maxPosts });
  const totals: PersistStats = { items: 0, historyInserted: 0, historyUpdated: 0, outagesInserted: 0, outagesUpdated: 0, forecastsUpserted: 0, skipped: 0, errors: 0 };
  const noteParts: string[] = [];
  let images = 0;
  let imagesFailed = 0;
  let skippedImportedPosts = 0;

  for (const post of posts) {
    const alreadyImported = await importedRowsForPost(post);
    const force = process.env.PLANNING_FORCE_REPROCESS === "true";
    if (!force && alreadyImported >= minImportedRows()) {
      skippedImportedPosts++;
      continue;
    }

    const extracted = await extractItemsFromPost(post, list);
    images += extracted.images;
    imagesFailed += extracted.imagesFailed;
    if (extracted.errors.length) noteParts.push(`post ${post.id} aiErrors=${extracted.errors.slice(0, 2).join(" ; ")}`);

    try {
      const stats = await persistPlanningItems(post, extracted.items, list);
      mergeStats(totals, stats);
    } catch (e) {
      totals.errors++;
      noteParts.push(`post ${post.id} persist=${e instanceof Error ? e.message : String(e)}`);
      console.warn("[planning-backfill] post persist failed", post.link, e);
    }
  }

  const inserted = totals.historyInserted + totals.outagesInserted + totals.forecastsUpserted;
  const updated = totals.historyUpdated + totals.outagesUpdated;
  const wrote = writeCount(totals);
  const ok = totals.errors === 0 && (wrote > 0 || skippedImportedPosts > 0) && imagesFailed < Math.max(1, images);

  await supabaseAdmin.from("scraper_runs").insert({
    source: "smgeag-planning-backfill",
    url: `wp-json since=${since}`,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok,
    items_found: totals.items,
    items_inserted: inserted,
    items_updated: updated,
    notes: summarizeNotes([
      `posts=${posts.length}`,
      `images=${images}`,
      `imagesFailed=${imagesFailed}`,
      `history=${totals.historyInserted}/${totals.historyUpdated}`,
      `outages=${totals.outagesInserted}/${totals.outagesUpdated}`,
      `forecasts=${totals.forecastsUpserted}`,
      `skipped=${totals.skipped}`,
      `skippedImportedPosts=${skippedImportedPosts}`,
      `errors=${totals.errors}`,
      ...noteParts,
    ]),
  });

  return {
    ok,
    since,
    posts: posts.length,
    images,
    images_failed: imagesFailed,
    items_extracted: totals.items,
    history_inserted: totals.historyInserted,
    history_updated: totals.historyUpdated,
    outages_inserted: totals.outagesInserted,
    outages_updated: totals.outagesUpdated,
    forecasts_upserted: totals.forecastsUpserted,
    skipped: totals.skipped,
    skipped_imported_posts: skippedImportedPosts,
    errors: totals.errors,
  };
}
