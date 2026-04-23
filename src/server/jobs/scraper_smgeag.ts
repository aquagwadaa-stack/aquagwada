import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Scraper SMGEAG (https://www.smgeag.fr/).
 *
 * Stratégie réelle (à compléter quand le sélecteur HTML aura été identifié) :
 *   1. fetch HTML de la page "Travaux et coupures"
 *   2. parse le DOM, extrait { commune, date, heure_debut, heure_fin, cause }
 *   3. normalise -> Outage[]
 *   4. injecte via le pipeline d'ingestion (déduplication, merge intelligent)
 *
 * Pour l'instant : implémentation stub qui fait un fetch et journalise.
 * Active uniquement quand l'URL/parser est validé pour ne pas spammer.
 */

const SMGEAG_URL = "https://www.smgeag.fr/travaux-en-cours/";

export async function scrapeSmgeag(): Promise<{ ok: boolean; found: number; note: string }> {
  try {
    const res = await fetch(SMGEAG_URL, {
      headers: { "user-agent": "AquaGwadaBot/1.0 (+contact@aquagwada.app)" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { ok: false, found: 0, note: `HTTP ${res.status}` };
    }

    const html = await res.text();

    // TODO: parsing HTML réel. Pour l'instant on logge la taille pour validation infra.
    const sizeKb = Math.round(html.length / 1024);
    console.log(`[scraper:smgeag] récupéré ${sizeKb} KB depuis ${SMGEAG_URL}`);

    // Utilisation de supabaseAdmin uniquement quand on aura des items réels.
    void supabaseAdmin;

    return { ok: true, found: 0, note: `HTML ${sizeKb}KB — parser à implémenter` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[scraper:smgeag] erreur:", msg);
    return { ok: false, found: 0, note: msg };
  }
}