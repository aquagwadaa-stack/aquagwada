import { createFileRoute } from "@tanstack/react-router";
import { scrapePlanning } from "@/server/jobs/scrape_planning";

/** Cron : scrape planning hebdo SMGEAG. Quotidien. */
export const Route = createFileRoute("/api/public/jobs/scrape-planning")({
  server: {
    handlers: {
      GET: async () => runScrapePlanning(),
      POST: async () => {
        return runScrapePlanning();
      },
    },
  },
});

async function runScrapePlanning() {
  try {
    const result = await scrapePlanning();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "content-type": "application/json" } });
  }
}