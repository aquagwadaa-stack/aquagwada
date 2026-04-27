import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const GUADELOUPE_TZ = "America/Guadeloupe";

const SEARCH_QUERIES = [
  "site:facebook.com Guadeloupe \"coupure d'eau\"",
  "site:facebook.com Guadeloupe \"plus d'eau\"",
  "site:facebook.com Guadeloupe \"pas d'eau\"",
  "site:facebook.com Guadeloupe \"eau coupée\"",
  "site:facebook.com Guadeloupe \"basse pression\" eau",
  "site:facebook.com SMGEAG coupure eau",
  "site:facebook.com \"tour d'eau\" Guadeloupe",
];

type CommuneRow = { id: string; name: string; slug: string };
type SearchResult = { url: string; title?: string; description?: string; markdown?: string };
type SignalCandidate = {
  url: string;
  title: string;
  text: string;
  communeIds: string[];
  sector: string | null;
  startsAt: Date;
  isCurrent: boolean;
  confidence: number;
};

type CurrentGroup = {
  communeId: string;
  sector: string | null;
  urls: string[];
  titles: string[];
  startsAt: Date;
  confidence: number;
  count: number;
};

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

function norm(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return `fb_${(h >>> 0).toString(36)}`;
}

function guadeloupeDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: GUADELOUPE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function toGuadeloupeDateTime(dateKey: string, minutesOfDay: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0, 0));
}

function parseTimeMinutes(text: string): number | null {
  const m = norm(text).match(/\b(?:depuis|vers|a|de)?\s*(\d{1,2})\s*h\s*(\d{2})?\b/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseMentionedDateKey(text: string, now: Date): string | null {
  const n = norm(text);
  const today = guadeloupeDateKey(now);
  if (/\b(aujourd hui|ce matin|ce soir|actuellement|en ce moment|maintenant)\b/.test(n)) return today;
  if (/\bhier\b/.test(n)) return guadeloupeDateKey(new Date(now.getTime() - 86400_000));

  const m = n.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?\b/);
  if (!m) return null;
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: GUADELOUPE_TZ, year: "numeric" }).format(now));
  const year = m[3] ? Number(m[3]) : currentYear;
  const month = MONTHS[m[2]];
  const day = Number(m[1]);
  if (!month || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isWaterSignal(text: string): boolean {
  const n = norm(text);
  return /(coupure|eau coupee|plus d eau|pas d eau|manque d eau|basse pression|robinet sec|distribution d eau|perturbation.*eau|fuite.*eau)/.test(n);
}

function hasCurrentMarker(text: string, now: Date): boolean {
  const n = norm(text);
  if (/(aujourd hui|actuellement|en ce moment|maintenant|ce matin|ce soir|depuis|urgent|en cours|pas d eau depuis|plus d eau depuis)/.test(n)) return true;
  return parseMentionedDateKey(text, now) === guadeloupeDateKey(now);
}

function findCommuneIds(text: string, communes: CommuneRow[]): string[] {
  const haystack = norm(text);
  const ids = new Set<string>();
  for (const c of communes) {
    const name = norm(c.name);
    const slug = norm(c.slug);
    if (name.length >= 4 && (haystack.includes(name) || haystack.includes(slug))) ids.add(c.id);
  }

  const aliases: Record<string, string[]> = {
    abymes: ["les-abymes"],
    gosier: ["le-gosier"],
    moule: ["le-moule"],
    desirade: ["la-desirade"],
    cbe: ["capesterre-belle-eau"],
    capesterre: ["capesterre-belle-eau"],
    saintes: ["terre-de-haut", "terre-de-bas"],
  };
  for (const [alias, slugs] of Object.entries(aliases)) {
    if (!haystack.includes(alias)) continue;
    communes.filter((c) => slugs.includes(c.slug)).forEach((c) => ids.add(c.id));
  }
  return [...ids];
}

function extractSector(text: string): string | null {
  const direct = text.match(/\b(?:quartier|secteur|zone|rue|route|chemin|lotissement|résidence|residence|morne|section)\s+([A-Za-zÀ-ÿ0-9'’\-\s]{2,70})/i);
  if (direct?.[1]) return direct[1].replace(/[.,;:!?].*$/, "").trim().slice(0, 90) || null;

  const near = text.match(/\b(?:à|a|sur|vers)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9'’\-\s]{2,60})/);
  if (near?.[1]) {
    const candidate = near[1].replace(/[.,;:!?].*$/, "").trim();
    if (!/(guadeloupe|facebook|smgeag)/i.test(candidate)) return candidate.slice(0, 90);
  }
  return null;
}

async function firecrawlSearch(query: string, limit: number): Promise<SearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");

  const res = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[social-signals] search "${query}" HTTP ${res.status}: ${text.slice(0, 200)}`);
    return [];
  }

  const json = await res.json() as { data?: { web?: SearchResult[] } };
  return json.data?.web ?? [];
}

function toCandidate(result: SearchResult, communes: CommuneRow[], now: Date): SignalCandidate | null {
  const title = result.title?.trim() || "Publication Facebook";
  const text = [result.title, result.description, result.markdown].filter(Boolean).join("\n");
  if (!result.url || !/facebook\.com/i.test(result.url)) return null;
  if (!isWaterSignal(text)) return null;

  const dateKey = parseMentionedDateKey(text, now);
  const currentMarker = hasCurrentMarker(text, now);
  if (!dateKey && !currentMarker) return null;

  const communeIds = findCommuneIds(text, communes);
  if (communeIds.length === 0) return null;

  const timeMinutes = parseTimeMinutes(text);
  const startsAt = dateKey
    ? toGuadeloupeDateTime(dateKey, timeMinutes ?? 8 * 60)
    : new Date(now.getTime() - 30 * 60_000);

  const isCurrent = currentMarker && (now.getTime() - startsAt.getTime()) < 36 * 3600_000;
  const confidence = Math.min(0.72, 0.42 + (result.markdown ? 0.08 : 0) + (timeMinutes !== null ? 0.08 : 0) + (dateKey ? 0.06 : 0));

  return {
    url: result.url,
    title,
    text,
    communeIds,
    sector: extractSector(text),
    startsAt,
    isCurrent,
    confidence,
  };
}

async function hasActiveOfficialOutage(communeId: string, nowIso: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("outages")
    .select("id")
    .eq("commune_id", communeId)
    .eq("source", "official")
    .lte("starts_at", nowIso)
    .or(`ends_at.gte.${nowIso},ends_at.is.null`)
    .neq("status", "resolved")
    .neq("status", "cancelled")
    .limit(1);
  return !!data?.length;
}

function groupCurrentSignals(candidates: SignalCandidate[], now: Date): CurrentGroup[] {
  const groups = new Map<string, CurrentGroup>();
  const todayKey = guadeloupeDateKey(now);

  for (const candidate of candidates.filter((c) => c.isCurrent)) {
    for (const communeId of candidate.communeIds) {
      const sectorKey = norm(candidate.sector ?? "commune").slice(0, 80) || "commune";
      const key = `${communeId}|${sectorKey}|${todayKey}`;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.urls.includes(candidate.url)) existing.urls.push(candidate.url);
        if (!existing.titles.includes(candidate.title)) existing.titles.push(candidate.title);
        if (candidate.startsAt.getTime() < existing.startsAt.getTime()) existing.startsAt = candidate.startsAt;
        existing.confidence = Math.max(existing.confidence, candidate.confidence);
        existing.count += 1;
      } else {
        groups.set(key, {
          communeId,
          sector: candidate.sector,
          urls: [candidate.url],
          titles: [candidate.title],
          startsAt: candidate.startsAt,
          confidence: candidate.confidence,
          count: 1,
        });
      }
    }
  }
  return [...groups.values()];
}

async function upsertCurrentSignal(group: CurrentGroup, now: Date): Promise<"inserted" | "skipped"> {
  const nowIso = now.toISOString();
  if (await hasActiveOfficialOutage(group.communeId, nowIso)) return "skipped";

  const confidence = Math.min(0.72, group.confidence + Math.max(0, group.urls.length - 1) * 0.1);
  const reliability = Math.min(0.62, 0.36 + Math.max(0, group.urls.length - 1) * 0.08);
  const externalId = hashId(`facebook-current|${group.communeId}|${norm(group.sector ?? "commune")}|${guadeloupeDateKey(now)}`);
  const description = [
    `Signal Facebook détecté (${group.urls.length} source${group.urls.length > 1 ? "s" : ""}).`,
    group.titles.slice(0, 2).join(" · "),
  ].join(" ").slice(0, 500);

  const { error } = await supabaseAdmin.from("outages").upsert({
    commune_id: group.communeId,
    sector: group.sector,
    source: "user_report" as const,
    source_url: group.urls[0],
    external_id: externalId,
    starts_at: group.startsAt.toISOString(),
    ends_at: null,
    estimated_duration_minutes: 240,
    status: "ongoing" as const,
    cause: "signal Facebook",
    description,
    reliability_score: reliability,
    confidence_score: confidence,
    confidence_source_weight: 0.35,
    is_estimated: true,
    time_precision: "approximate" as const,
    updated_at: nowIso,
  }, { onConflict: "source,external_id" });

  if (error) throw error;
  return "inserted";
}

async function upsertHistoricalSignal(candidate: SignalCandidate): Promise<"inserted" | "skipped"> {
  if (candidate.isCurrent) return "skipped";
  const durationMinutes = 180;
  const endsAt = new Date(candidate.startsAt.getTime() + durationMinutes * 60_000);
  const rows = candidate.communeIds.map((communeId) => ({
    commune_id: communeId,
    source: "scraping" as const,
    source_url: candidate.url,
    external_id: hashId(`facebook-history|${communeId}|${candidate.startsAt.toISOString().slice(0, 13)}|${candidate.url}`),
    starts_at: candidate.startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    duration_minutes: durationMinutes,
    cause: "signal Facebook",
    description: `Signal Facebook historique: ${candidate.title}`.slice(0, 500),
    sector: candidate.sector,
    reliability_score: 0.42,
    confidence_score: candidate.confidence,
    time_precision: "approximate" as const,
  }));

  if (rows.length === 0) return "skipped";
  const { error } = await supabaseAdmin.from("outage_history").upsert(rows, { onConflict: "external_id" });
  if (error) throw error;
  return "inserted";
}

export async function scrapeSocialSignals(): Promise<{
  ok: boolean;
  pages_scanned: number;
  candidates: number;
  current_inserted: number;
  history_inserted: number;
  skipped: number;
  errors: number;
}> {
  const startedAt = new Date();
  const now = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const communeList = (communes ?? []) as CommuneRow[];

  const parsedLimit = Number(process.env.SOCIAL_SIGNAL_SEARCH_LIMIT ?? 6);
  const limit = Number.isFinite(parsedLimit) ? Math.min(10, Math.max(3, parsedLimit)) : 6;
  const seenUrls = new Set<string>();
  const candidates: SignalCandidate[] = [];
  let pagesScanned = 0;
  let currentInserted = 0;
  let historyInserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const query of SEARCH_QUERIES) {
    let results: SearchResult[] = [];
    try {
      results = await firecrawlSearch(query, limit);
    } catch (error) {
      errors++;
      console.warn("[social-signals] search error", error);
      continue;
    }

    for (const result of results) {
      if (!result.url || seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      pagesScanned++;
      const candidate = toCandidate(result, communeList, now);
      if (candidate) candidates.push(candidate);
      else skipped++;
    }
  }

  for (const group of groupCurrentSignals(candidates, now)) {
    try {
      const status = await upsertCurrentSignal(group, now);
      if (status === "inserted") currentInserted++;
      else skipped++;
    } catch (error) {
      errors++;
      console.warn("[social-signals] current upsert error", error);
    }
  }

  for (const candidate of candidates.filter((c) => !c.isCurrent)) {
    try {
      const status = await upsertHistoricalSignal(candidate);
      if (status === "inserted") historyInserted++;
      else skipped++;
    } catch (error) {
      errors++;
      console.warn("[social-signals] history upsert error", error);
    }
  }

  await supabaseAdmin.from("scraper_runs").insert({
    source: "social-signals",
    url: "firecrawl facebook search",
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok: errors === 0,
    items_found: candidates.length,
    items_inserted: currentInserted + historyInserted,
    items_updated: 0,
    notes: `pages=${pagesScanned} current=${currentInserted} history=${historyInserted} skipped=${skipped} errors=${errors}`,
  });

  return {
    ok: errors === 0,
    pages_scanned: pagesScanned,
    candidates: candidates.length,
    current_inserted: currentInserted,
    history_inserted: historyInserted,
    skipped,
    errors,
  };
}
