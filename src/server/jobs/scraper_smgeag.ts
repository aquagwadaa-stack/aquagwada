import * as cheerio from "cheerio";
import { CONTACT_EMAIL } from "@/lib/contact";
import { guadeloupeDateTimeToUtc } from "@/lib/timezone";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Scraper SMGEAG multi-pages.
 *
 * This job is only for live/network notices such as works, leaks and service
 * interruptions. Weekly "tours d'eau" planning images are handled by
 * scrape_planning.ts, because parsing them from generic HTML creates false
 * positives from navigation/homepage text.
 */

const SOURCES = [
  { url: "https://www.smgeag.fr/les-actualites/", source: "smgeag-actualites" },
  { url: "https://www.smgeag.fr/travaux-3/", source: "smgeag-travaux" },
  { url: "https://www.smgeag.fr/informations-reseau/", source: "smgeag-reseau" },
] as const;

const FETCH_TIMEOUT = 20_000;
const UA = `AquaGwadaBot/1.0 (+mailto:${CONTACT_EMAIL})`;

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

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  return `smgeag_${(h >>> 0).toString(36)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function guadeloupeDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guadeloupe",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function makeDateKey(year: number, monthIndex: number, day: number): string | null {
  const d = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null;
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function extractDateKey(text: string, now: Date): string | null {
  const normalized = norm(text);
  if (/\b(ce jour|aujourd hui|aujourdhui)\b/.test(normalized)) return guadeloupeDateKey(now);

  const months: Record<string, number> = {
    janvier: 0,
    fevrier: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    aout: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    decembre: 11,
  };

  const m1 = normalized.match(/(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/i);
  if (m1) {
    const day = Number(m1[1]);
    const month = months[m1[2]];
    const year = m1[3] ? Number(m1[3]) : Number(guadeloupeDateKey(now).slice(0, 4));
    return makeDateKey(year, month, day);
  }

  const m2 = normalized.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?/);
  if (m2) {
    const day = Number(m2[1]);
    const month = Number(m2[2]) - 1;
    let year = Number(guadeloupeDateKey(now).slice(0, 4));
    if (m2[3]) {
      year = Number(m2[3]);
      if (year < 100) year += 2000;
    }
    return makeDateKey(year, month, day);
  }

  return null;
}

function extractHour(text: string): { h: number; m: number } | null {
  const m = text.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function extractTimeWindow(text: string): { start: { h: number; m: number } | null; end: { h: number; m: number } | null } {
  const m = text.match(/(?:de|a partir de|\u00e0 partir de)?\s*(\d{1,2})\s*[h:]\s*(\d{2})?\s*(?:\u00e0|a|au|jusqu(?:'|\u2019)\u00e0|-)\s*(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!m) return { start: extractHour(text), end: null };

  const start = { h: Number(m[1]), m: m[2] ? Number(m[2]) : 0 };
  const end = { h: Number(m[3]), m: m[4] ? Number(m[4]) : 0 };
  if (start.h > 23 || start.m > 59 || end.h > 23 || end.m > 59) return { start: extractHour(text), end: null };
  return { start, end };
}

function timeKey(value: { h: number; m: number }): string {
  return `${pad2(value.h)}:${pad2(value.m)}`;
}

type CommuneRow = { id: string; name: string; slug: string };
type ScrapedItem = {
  url: string;
  external_id: string;
  commune_ids: string[];
  starts_at: string;
  ends_at: string;
  description: string;
  cause: string | null;
  reliability_score: number;
  confidence_score: number;
  is_estimated: boolean;
  status: "scheduled" | "ongoing";
};

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[scraper] ${url} HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(`[scraper] ${url}`, e);
    return null;
  }
}

function containsCommune(text: string, commune: CommuneRow): boolean {
  const haystack = ` ${text} `;
  const name = norm(commune.name);
  const slug = norm(commune.slug.replace(/-/g, " "));
  return (name.length >= 3 && haystack.includes(` ${name} `)) || (slug.length >= 3 && haystack.includes(` ${slug} `));
}

function detectCause(lower: string): string | null {
  if (/\bfuite\b/.test(lower)) return "fuite";
  if (/\bmaintenance\b|\bentretien\b/.test(lower)) return "maintenance";
  if (/\btravaux\b/.test(lower)) return "travaux";
  if (/\breparation\b/.test(lower)) return "reparation";
  if (/\bcoupure\b|\binterruption\b/.test(lower)) return "coupure";
  if (/\bperturbation\b|\bbaisse de pression\b/.test(lower)) return "perturbation";
  return null;
}

function resolveUrl(href: string | undefined, baseUrl: string): string {
  if (!href) return baseUrl;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function parseHtml(html: string, sourceUrl: string, sourceKey: string, communes: CommuneRow[], now: Date): ScrapedItem[] {
  const $ = cheerio.load(html);
  const items: ScrapedItem[] = [];

  const blocks = $("article, .post, .elementor-post, .news-item, .actualite, .travaux").toArray();
  const seenInPage = new Set<string>();

  for (const el of blocks) {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (text.length < 60 || text.length > 4000) continue;

    const lower = norm(text);

    const isBoilerplate = /(agence en ligne|carte infos reseau|restons connectes|no results found|toutes les actualites|toutes les informations|mes demarches)/.test(lower);
    if (isBoilerplate) continue;

    const isWeeklyPlanning = /\bplanning\b.*\btours?\b.*\beau\b|\btours?\b\s+d\s+eau\b/.test(lower);
    if (isWeeklyPlanning) continue;

    const hasStrongKeyword = /(coupure|interruption|baisse de pression|fuite|reparation|travaux|casse|rupture|perturbation)/.test(lower);
    if (!hasStrongKeyword) continue;

    const matchedCommunes = communes.filter((c) => containsCommune(lower, c)).map((c) => c.id);
    if (matchedCommunes.length === 0) continue;

    const dateKey = extractDateKey(text, now);
    if (!dateKey) continue;

    const window = extractTimeWindow(text);
    const startTime = window.start ? timeKey(window.start) : "08:00";
    const start = guadeloupeDateTimeToUtc(dateKey, startTime);
    if (!start) continue;

    let end: Date;
    if (window.end) {
      const parsedEnd = guadeloupeDateTimeToUtc(dateKey, timeKey(window.end));
      if (!parsedEnd) continue;
      end = parsedEnd;
      if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    } else {
      end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    }

    if (end.getTime() < now.getTime() - 15 * 60 * 1000) continue;

    const status: "scheduled" | "ongoing" = start.getTime() > now.getTime() + 5 * 60 * 1000 ? "scheduled" : "ongoing";
    const desc = text.slice(0, 600);
    const link = resolveUrl($el.find("a[href]").first().attr("href"), sourceUrl);
    const externalId = hashId(`${sourceKey}|${link}|${matchedCommunes.sort().join(",")}|${start.toISOString()}|${desc.slice(0, 100)}`);
    if (seenInPage.has(externalId)) continue;
    seenInPage.add(externalId);

    items.push({
      url: link,
      external_id: externalId,
      commune_ids: matchedCommunes,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      description: desc,
      cause: detectCause(lower),
      reliability_score: 0.7,
      confidence_score: window.start ? 0.75 : 0.55,
      is_estimated: !window.start || !window.end,
      status,
    });
  }

  return items;
}

export async function scrapeSmgeag(): Promise<{ ok: boolean; sources: number; found: number; inserted: number; updated: number; errors: number }> {
  const now = new Date();

  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];

  let totalFound = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let sourcesOk = 0;

  for (const src of SOURCES) {
    const startedAt = new Date();
    const html = await fetchPage(src.url);
    if (!html) {
      await supabaseAdmin.from("scraper_runs").insert({
        source: src.source,
        url: src.url,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        ok: false,
        error: "fetch failed",
      });
      totalErrors++;
      continue;
    }

    let items: ScrapedItem[] = [];
    try {
      items = parseHtml(html, src.url, src.source, list, now);
    } catch (e) {
      await supabaseAdmin.from("scraper_runs").insert({
        source: src.source,
        url: src.url,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      totalErrors++;
      continue;
    }

    let inserted = 0;
    let updated = 0;
    for (const item of items) {
      for (const communeId of item.commune_ids) {
        const externalId = `${item.external_id}_${communeId.slice(0, 8)}`;
        const durationMinutes = Math.max(1, Math.round((new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60000));
        const row = {
          commune_id: communeId,
          source: "official" as const,
          source_url: item.url,
          external_id: externalId,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          estimated_duration_minutes: durationMinutes,
          description: item.description,
          cause: item.cause,
          reliability_score: item.reliability_score,
          confidence_score: item.confidence_score,
          confidence_source_weight: 1.0,
          is_estimated: item.is_estimated,
          time_precision: item.is_estimated ? "approximate" as const : "exact" as const,
          status: item.status,
        };

        const { data: existing } = await supabaseAdmin
          .from("outages")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabaseAdmin.from("outages").update({
            source_url: row.source_url,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            estimated_duration_minutes: row.estimated_duration_minutes,
            description: row.description,
            cause: row.cause,
            reliability_score: row.reliability_score,
            confidence_score: row.confidence_score,
            is_estimated: row.is_estimated,
            time_precision: row.time_precision,
            status: row.status,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          if (!error) updated++;
        } else {
          const { error } = await supabaseAdmin.from("outages").insert(row);
          if (!error) inserted++;
        }
      }
    }

    totalFound += items.length;
    totalInserted += inserted;
    totalUpdated += updated;
    sourcesOk++;

    await supabaseAdmin.from("scraper_runs").insert({
      source: src.source,
      url: src.url,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      ok: true,
      items_found: items.length,
      items_inserted: inserted,
      items_updated: updated,
      notes: items.length === 0 ? "Aucun item reseau detecte" : null,
    });
  }

  return { ok: totalErrors === 0, sources: sourcesOk, found: totalFound, inserted: totalInserted, updated: totalUpdated, errors: totalErrors };
}
