import * as cheerio from "cheerio";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Scraper SMGEAG multi-pages.
 * - Récupère 4 pages SMGEAG (actualités, travaux, infos réseau, accueil)
 * - Parse les blocs de contenu, détecte les communes mentionnées et dates
 * - Insère dans `outages` avec déduplication par external_id
 * - Logge chaque exécution dans `scraper_runs` pour monitoring
 */

const SOURCES = [
  { url: "https://www.smgeag.fr/les-actualites/", source: "smgeag-actualites" },
  { url: "https://www.smgeag.fr/travaux-3/", source: "smgeag-travaux" },
  { url: "https://www.smgeag.fr/informations-reseau/", source: "smgeag-reseau" },
  { url: "https://www.smgeag.fr/", source: "smgeag-home" },
] as const;

const FETCH_TIMEOUT = 20_000;
const UA = "AquaGwadaBot/1.0 (+contact@aquagwada.fr)";

/** Normalise un texte : minuscules, sans accents, espaces compactés. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/** Hash stable pour external_id (pas de crypto requis). */
function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) { h = ((h << 5) - h + input.charCodeAt(i)) | 0; }
  return `smgeag_${(h >>> 0).toString(36)}`;
}

/** Extrait une date FR du texte (ex: "le 25 avril 2026", "25/04/2026", "le 25 avril à 22h"). */
function extractDate(text: string, now: Date): Date | null {
  const months: Record<string, number> = {
    janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
  };
  // "25 avril 2026" ou "25 avril"
  const m1 = text.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(\d{4}))?/i);
  if (m1) {
    const day = Number(m1[1]);
    const month = months[m1[2].toLowerCase()];
    const year = m1[3] ? Number(m1[3]) : now.getFullYear();
    return new Date(year, month, day, 0, 0, 0);
  }
  // "25/04/2026" ou "25/04"
  const m2 = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m2) {
    const day = Number(m2[1]);
    const month = Number(m2[2]) - 1;
    let year = now.getFullYear();
    if (m2[3]) { year = Number(m2[3]); if (year < 100) year += 2000; }
    return new Date(year, month, day, 0, 0, 0);
  }
  return null;
}

/** Extrait une heure (ex: "22h", "22h30", "22:30"). */
function extractHour(text: string): { h: number; m: number } | null {
  const m = text.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

type CommuneRow = { id: string; name: string; slug: string };
type ScrapedItem = {
  source: string;
  url: string;
  external_id: string;
  commune_ids: string[];
  starts_at: string;
  ends_at: string | null;
  description: string;
  cause: string | null;
  reliability_score: number;
  confidence_score: number;
  is_estimated: boolean;
};

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) { console.warn(`[scraper] ${url} HTTP ${res.status}`); return null; }
    return await res.text();
  } catch (e) {
    console.warn(`[scraper] ${url}`, e);
    return null;
  }
}

function parseHtml(html: string, sourceUrl: string, sourceKey: string, communes: CommuneRow[], now: Date): ScrapedItem[] {
  const $ = cheerio.load(html);
  const items: ScrapedItem[] = [];

  // Cible large : articles, posts, divs avec dates ou titres
  const blocks = $("article, .post, .actualite, .travaux, .info, .news-item, .elementor-post, .elementor-widget-text-editor, .entry-content, main p, main li").toArray();

  const seenInPage = new Set<string>();

  for (const el of blocks) {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (text.length < 30 || text.length > 2000) continue;
    const lower = norm(text);

    // Filtre : doit contenir au moins un mot-clé coupure / travaux / réseau
    const hasKeyword = /(coupure|interruption|baisse de pression|travaux|reparation|fuite|maintenance|reseau|distribution|alimentation)/.test(lower);
    if (!hasKeyword) continue;

    // Identifie les communes mentionnées
    const matchedCommunes: string[] = [];
    for (const c of communes) {
      const cn = norm(c.name);
      if (cn.length < 3) continue;
      // mot entier (évite "saint" qui matcherait partout)
      const re = new RegExp(`\\b${cn.replace(/[-\s]/g, "[-\\s]")}\\b`, "i");
      if (re.test(lower)) matchedCommunes.push(c.id);
    }
    if (matchedCommunes.length === 0) continue;

    const date = extractDate(text, now);
    const hour = extractHour(text);
    let starts_at: Date;
    let time_known = false;
    if (date) {
      starts_at = new Date(date);
      if (hour) { starts_at.setHours(hour.h, hour.m, 0, 0); time_known = true; }
    } else {
      starts_at = new Date(now);
    }

    // Cause heuristique
    let cause: string | null = null;
    if (/fuite/.test(lower)) cause = "fuite";
    else if (/maintenance|entretien/.test(lower)) cause = "maintenance";
    else if (/travaux/.test(lower)) cause = "travaux";
    else if (/reparation/.test(lower)) cause = "réparation";
    else if (/coupure/.test(lower)) cause = "coupure";

    const desc = text.slice(0, 500);
    const externalId = hashId(`${sourceKey}|${matchedCommunes.sort().join(",")}|${starts_at.toISOString().slice(0, 10)}|${desc.slice(0, 80)}`);
    if (seenInPage.has(externalId)) continue;
    seenInPage.add(externalId);

    items.push({
      source: sourceKey,
      url: sourceUrl,
      external_id: externalId,
      commune_ids: matchedCommunes,
      starts_at: starts_at.toISOString(),
      ends_at: null,
      description: desc,
      cause,
      reliability_score: 0.95, // SMGEAG officiel
      confidence_score: time_known ? 0.85 : 0.65,
      is_estimated: !time_known,
    });
  }

  return items;
}

export async function scrapeSmgeag(): Promise<{ ok: boolean; sources: number; found: number; inserted: number; updated: number; errors: number }> {
  const now = new Date();

  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];

  let totalFound = 0, totalInserted = 0, totalUpdated = 0, totalErrors = 0, sourcesOk = 0;

  for (const src of SOURCES) {
    const startedAt = new Date();
    const html = await fetchPage(src.url);
    if (!html) {
      await supabaseAdmin.from("scraper_runs").insert({
        source: src.source, url: src.url, started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(), ok: false, error: "fetch failed",
      });
      totalErrors++;
      continue;
    }

    let items: ScrapedItem[] = [];
    try { items = parseHtml(html, src.url, src.source, list, now); }
    catch (e) {
      await supabaseAdmin.from("scraper_runs").insert({
        source: src.source, url: src.url, started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message : String(e),
      });
      totalErrors++;
      continue;
    }

    let inserted = 0, updated = 0;
    for (const item of items) {
      for (const communeId of item.commune_ids) {
        const externalId = `${item.external_id}_${communeId.slice(0, 8)}`;
        const row = {
          commune_id: communeId,
          source: "official" as const,
          source_url: item.url,
          external_id: externalId,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          description: item.description,
          cause: item.cause,
          reliability_score: item.reliability_score,
          confidence_score: item.confidence_score,
          confidence_source_weight: 1.0,
          is_estimated: item.is_estimated,
          time_precision: item.is_estimated ? "approximate" as const : "exact" as const,
          status: "ongoing" as const,
        };

        // Upsert manuel : check si external_id existe
        const { data: existing } = await supabaseAdmin
          .from("outages")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();

        if (existing) {
          await supabaseAdmin.from("outages").update({
            description: row.description,
            confidence_score: row.confidence_score,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          updated++;
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
      source: src.source, url: src.url,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      ok: true,
      items_found: items.length,
      items_inserted: inserted,
      items_updated: updated,
      notes: items.length === 0 ? "Aucun item détecté" : null,
    });
  }

  return { ok: totalErrors === 0, sources: sourcesOk, found: totalFound, inserted: totalInserted, updated: totalUpdated, errors: totalErrors };
}