import { createFileRoute } from "@tanstack/react-router";
import { scrapeSmgeag } from "@/server/jobs/scraper_smgeag";

/** Cron : scrape SMGEAG. Toutes les 15 min. */
export const Route = createFileRoute("/api/public/jobs/scrape-smgeag")({
  server: {
    handlers: {
      GET: async () => runScrapeSmgeag(),
      POST: async ({ request }) => {
        return runScrapeSmgeag();
      },
    },
  },
});

async function runScrapeSmgeag() {
  try {
    const result = await scrapeSmgeag();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "content-type": "application/json" } });
  }
}