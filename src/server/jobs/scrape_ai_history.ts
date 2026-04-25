import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Construit l'historique des coupures d'eau en Guadeloupe.
 *
 * Pipeline :
 *  1. Firecrawl /search → trouve les pages contenant "coupure d'eau Guadeloupe", presse, SMGEAG, etc.
 *  2. Firecrawl /scrape → récupère le markdown complet de chaque page (limité)
 *  3. Lovable AI (Gemini 2.5 Flash) → extrait JSON structuré (commune, date, durée, cause)
 *  4. Insère dans `outage_history` avec déduplication par external_id
 *  5. Logge dans `scraper_runs`
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

const SEARCH_QUERIES = [
  "coupure eau SMGEAG Guadeloupe",
  "coupure eau Guadeloupe France-Antilles",
  "tour d'eau SMGEAG",
  "perturbation distribution eau Guadeloupe",
  "travaux SMGEAG Guadeloupe",
  "site:smgeag.fr coupure",
  "site:smgeag.fr travaux",
  "site:franceantilles.fr coupure eau Guadeloupe",
  "site:rci.fm coupure eau Guadeloupe",
  "site:karibinfo.com eau Guadeloupe",
];

type CommuneRow = { id: string; name: string; slug: string };

type AIOutage = {
  commune_name: string;
  starts_at: string; // ISO
  ends_at: string | null;
  duration_minutes: number | null;
  cause: string | null;
  description: string;
  sector: string | null;
  time_precision: "exact" | "approximate";
};

function norm(s: string): string {
  if (typeof s !== "string" || !s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) { h = ((h << 5) - h + input.charCodeAt(i)) | 0; }
  return `aih_${(h >>> 0).toString(36)}`;
}

async function firecrawlSearch(query: string, limit = 10): Promise<Array<{ url: string; title?: string; description?: string; markdown?: string }>> {
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
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn(`[ai-history] search "${query}" HTTP ${res.status}: ${txt.slice(0, 200)}`);
    return [];
  }
  const json = await res.json() as { data?: { web?: Array<{ url: string; title?: string; description?: string; markdown?: string }> } };
  return json.data?.web ?? [];
}

async function callAI(markdown: string, sourceUrl: string, communeNames: string[]): Promise<AIOutage[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const systemPrompt = `Tu es un expert en analyse d'articles de presse et communiqués officiels concernant les coupures d'eau en Guadeloupe (SMGEAG).
Ta mission : extraire UNIQUEMENT les coupures d'eau réelles (passées ou en cours) mentionnées dans le texte.

Communes valides en Guadeloupe : ${communeNames.join(", ")}.

Règles strictes :
- Ignore les annonces purement futures sans date précise
- Ignore les articles génériques sans coupure datée
- Pour chaque coupure : identifie la commune EXACTE (depuis la liste), la date de début (ISO 8601), la fin si connue
- Si l'heure n'est pas précise, mets time_precision="approximate" et starts_at à 00:00 du jour
- Cause possible : "fuite", "travaux", "maintenance", "réparation", "tour d'eau", "rupture", "panne", "casse", null si inconnu
- description : phrase courte (max 300 chars) résumant l'incident
- sector : quartier/section si mentionné, sinon null
- duration_minutes : si déductible, sinon null
- Retourne TOUJOURS un objet JSON { "outages": [...] } même si vide`;

  const userPrompt = `Source : ${sourceUrl}\n\nContenu :\n${markdown.slice(0, 12_000)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn(`[ai-history] AI HTTP ${res.status}: ${txt.slice(0, 200)}`);
    return [];
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { outages?: AIOutage[] };
    return Array.isArray(parsed.outages) ? parsed.outages : [];
  } catch {
    return [];
  }
}

function findCommuneId(name: string, communes: CommuneRow[]): string | null {
  if (!name) return null;
  const target = norm(name);
  if (!target) return null;
  for (const c of communes) {
    if (norm(c.name) === target) return c.id;
  }
  // tolérance : inclusion
  for (const c of communes) {
    const cn = norm(c.name);
    if (cn.length >= 4 && (target.includes(cn) || cn.includes(target))) return c.id;
  }
  return null;
}

function findCommuneIdsInText(text: string, communes: CommuneRow[]): string[] {
  const haystack = norm(text);
  return communes
    .filter((c) => {
      const cn = norm(c.name);
      return cn.length >= 4 && haystack.includes(cn);
    })
    .map((c) => c.id);
}

export async function scrapeAIHistory(): Promise<{ ok: boolean; pages_scanned: number; outages_extracted: number; inserted: number; skipped: number; errors: number }> {
  const startedAt = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];
  const communeNames = list.map((c) => c.name);

  let pagesScanned = 0;
  let outagesExtracted = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    let results: Array<{ url: string; title?: string; description?: string; markdown?: string }> = [];
    try { results = await firecrawlSearch(query, 8); }
    catch (e) { errors++; console.warn(`[ai-history] search error`, e); continue; }

    for (const r of results) {
      if (!r.url || seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      const md = r.markdown ?? "";
      if (md.length < 200) { skipped++; continue; }

      pagesScanned++;

      let aiResults: AIOutage[] = [];
      try { aiResults = await callAI(md, r.url, communeNames); }
      catch (e) { errors++; console.warn(`[ai-history] AI error`, e); continue; }

      outagesExtracted += aiResults.length;

      for (const out of aiResults) {
        const communeIds = findCommuneId(out.commune_name, list)
          ? [findCommuneId(out.commune_name, list)!]
          : findCommuneIdsInText(`${out.commune_name} ${out.description} ${md.slice(0, 2000)}`, list);
        if (communeIds.length === 0) { skipped++; continue; }
        const startsAt = new Date(out.starts_at);
        if (Number.isNaN(startsAt.getTime())) { skipped++; continue; }

        for (const communeId of communeIds) {
        const externalId = hashId(`${communeId}|${startsAt.toISOString().slice(0, 16)}|${out.description.slice(0, 60)}`);

        // Dédup
        const { data: existing } = await supabaseAdmin
          .from("outage_history")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();
        if (existing) { skipped++; continue; }

        const parsedEnd = out.ends_at ? new Date(out.ends_at) : null;
        const endsAt = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;
        const duration = out.duration_minutes ?? (endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60000) : 180);
        const safeEnd = endsAt ?? new Date(startsAt.getTime() + Math.max(1, duration) * 60_000);

        const { error } = await supabaseAdmin.from("outage_history").insert({
          commune_id: communeId,
          source: "scraping",
          source_url: r.url,
          external_id: externalId,
          starts_at: startsAt.toISOString(),
          ends_at: safeEnd.toISOString(),
          duration_minutes: Math.max(1, duration),
          description: out.description.slice(0, 500),
          cause: out.cause,
          sector: out.sector,
          reliability_score: 0.85,
          confidence_score: out.time_precision === "exact" ? 0.9 : 0.7,
          time_precision: out.time_precision,
        });
        if (error) { errors++; console.warn(`[ai-history] insert error`, error.message); }
        else { inserted++; }
        }
      }
    }
  }

  await supabaseAdmin.from("scraper_runs").insert({
    source: "ai-history",
    url: "firecrawl+gemini",
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok: errors === 0,
    items_found: outagesExtracted,
    items_inserted: inserted,
    items_updated: 0,
    notes: `pages=${pagesScanned} skipped=${skipped} errors=${errors}`,
  });

  return { ok: errors === 0, pages_scanned: pagesScanned, outages_extracted: outagesExtracted, inserted, skipped, errors };
}