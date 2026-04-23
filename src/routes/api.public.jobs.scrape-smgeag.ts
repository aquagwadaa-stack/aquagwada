import { createFileRoute } from "@tanstack/react-router";
import { scrapeSmgeag } from "@/server/jobs/scraper_smgeag";

/** Cron : scrape SMGEAG. Toutes les 15 min. */
export const Route = createFileRoute("/api/public/jobs/scrape-smgeag")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-job-token");
        const expected = process.env.JOB_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }
        try {
          const result = await scrapeSmgeag();
          return new Response(JSON.stringify(result), { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
        }
      },
    },
  },
});